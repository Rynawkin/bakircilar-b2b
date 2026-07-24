'use client';

import Link from 'next/link';
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  AlertTriangle,
  Layers,
  Users,
  Search,
} from 'lucide-react';
import {
  Fragment,
  formatCurrency,
  useKategoriAlimKaybi,
  type SortBy,
} from './useKategoriAlimKaybi';
import { SalesDecisionReportGuide } from '@/components/reports/SalesDecisionReportGuide';
import { SALES_DECISION_REPORTS } from '@/lib/reports/salesDecisionReports';

/**
 * Yeni gorunum: Kategori Alim Kaybi Raporu.
 *
 * Tum mantik useKategoriAlimKaybi hook'undan gelir; hicbir veri/handler/buton/
 * kolon/filtre/ozet-kart/sekme(mod)/satir-aksiyon(Detay genisleme)/export/sayfalama/
 * sirala DUSURULMEMISTIR. Klasik birebir korunur (KategoriAlimKaybiClassic).
 *
 * Tasarim referansi: design HTML #scr-profit / #scr-top genel rapor stili
 * (data-screen-label "Kâr Marjı Analizi" / "En Çok Satan"; bu rapora ozel ekran yok) +
 * brief 4.11.13. Genel rapor stili: beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac;
 * emerald/amber/red; lucide ikon; EMOJI YOK.
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const ROW_LINE = '#f1f4f9';
const TABLE_HEAD_BG = '#fafbfd';
const FIELD_LINE = '#e3e8f0';
const EMERALD = '#047857';
const RED = '#b91c1c';
const REPORT_DEFINITION = SALES_DECISION_REPORTS.categoryChurn;

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
  border: `1px solid ${FIELD_LINE}`,
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

const summaryCard: React.CSSProperties = { ...cardStyle, padding: 15 };
const cellRight: React.CSSProperties = { textAlign: 'right' };

// Mod toggle pill stilleri (Kategori Bazli / Cari Bazli)
const pillBase: React.CSSProperties = {
  padding: '7px 14px',
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 6,
  cursor: 'pointer',
  border: '1px solid transparent',
  background: 'none',
  color: FAINT,
  fontFamily: 'inherit',
};
const pillActive: React.CSSProperties = {
  ...pillBase,
  color: PRIMARY,
  background: '#fff',
  border: '1px solid #d3deef',
};

const dropdownWrap: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: '100%',
  zIndex: 20,
  marginTop: 4,
  maxHeight: 224,
  overflow: 'auto',
  borderRadius: 8,
  border: `1px solid ${LINE}`,
  background: '#fff',
  boxShadow: '0 8px 24px rgba(20,34,59,.10)',
};

const dropdownItem: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '8px 12px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// Sirala buton + ok ikonu (sortBy/sortDirection hook'tan)
function SortHead({
  field,
  label,
  align = 'left',
  sortBy,
  sortDirection,
  onSort,
}: {
  field: SortBy;
  label: string;
  align?: 'left' | 'right';
  sortBy: SortBy;
  sortDirection: 'asc' | 'desc';
  onSort: (f: SortBy) => void;
}) {
  const active = sortBy === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        width: align === 'right' ? '100%' : undefined,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 10,
        fontWeight: 600,
        color: active ? PRIMARY : FAINT,
        textTransform: 'uppercase',
        letterSpacing: '.02em',
      }}
    >
      {label}
      {active ? (
        sortDirection === 'asc' ? (
          <ChevronUp size={12} strokeWidth={2.4} />
        ) : (
          <ChevronDown size={12} strokeWidth={2.4} />
        )
      ) : (
        <ChevronDown size={12} strokeWidth={2} style={{ opacity: 0.35 }} />
      )}
    </button>
  );
}

export default function KategoriAlimKaybiNew() {
  const {
    mode,
    setMode,
    categorySearch,
    setCategorySearch,
    categoryCode,
    setCategoryCode,
    categoryName,
    setCategoryName,
    categoryOptions,
    categorySearching,
    customerSearch,
    setCustomerSearch,
    customerCode,
    setCustomerCode,
    customerName,
    setCustomerName,
    customerOptions,
    customerSearching,
    inactiveMonths,
    setInactiveMonths,
    activeFilterEnabled,
    setActiveFilterEnabled,
    activeCustomerMonths,
    setActiveCustomerMonths,
    sectorCode,
    setSectorCode,
    sectorOptions,
    minHistoricalDocumentCount,
    setMinHistoricalDocumentCount,
    minHistoricalAmount,
    setMinHistoricalAmount,
    submitted,
    rows,
    summary,
    metadata,
    loading,
    exporting,
    error,
    page,
    setPage,
    totalPages,
    sortBy,
    sortDirection,
    openDetailKey,
    detailLoadingKey,
    detailsByKey,
    tableMode,
    parseCustomerOption,
    handleSelectCustomer,
    handleSelectCategory,
    runReport,
    fetchReport,
    handleSort,
    handleExport,
    getRowKey,
    toggleDetail,
  } = useKategoriAlimKaybi();

  // Tablo grid sablonu moda gore degisir (Classic ile ayni kolon seti):
  // category: Cari Kodu | Cari Adi | Sektor | Kategori | Son Alim | Cari Son Satis | Evrak | Miktar | Tutar | Detay
  // customer: Kategori Kodu | Kategori Adi | Sektor | Son Alim | Cari Son Satis | Evrak | Miktar | Tutar | Detay
  const GRID =
    tableMode === 'category'
      ? '1.1fr 1.6fr 0.9fr 1.1fr 1fr 1fr 0.9fr 1fr 1.1fr 110px'
      : '1.1fr 1.6fr 0.9fr 1fr 1fr 0.9fr 1fr 1.1fr 110px';
  const MIN_W = tableMode === 'category' ? 1180 : 1080;

  return (
    <div className="px-3 py-4 sm:p-6" style={{ maxWidth: 1280, margin: '0 auto' }}>
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
        <span style={{ color: MUTED, fontWeight: 500 }}>{REPORT_DEFINITION.title}</span>
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
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
            <Layers size={22} strokeWidth={2} style={{ color: PRIMARY }} />
            {REPORT_DEFINITION.title}
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            {REPORT_DEFINITION.description}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExport}
            disabled={!submitted || loading || exporting}
            style={{
              ...headBtn,
              opacity: !submitted || loading || exporting ? 0.55 : 1,
              cursor: !submitted || loading || exporting ? 'not-allowed' : 'pointer',
            }}
          >
            {exporting ? (
              <RefreshCw size={15} strokeWidth={2} className="animate-spin" />
            ) : (
              <Download size={15} strokeWidth={2} />
            )}
            {exporting ? 'Aktarılıyor...' : "Excel'e Aktar"}
          </button>
          <button
            type="button"
            onClick={() => submitted && fetchReport(submitted, page)}
            disabled={!submitted}
            style={{
              ...headBtn,
              opacity: !submitted ? 0.55 : 1,
              cursor: !submitted ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={15} strokeWidth={2} />
            Yenile
          </button>
        </div>
      </div>

      <SalesDecisionReportGuide active="categoryChurn" />

      {/* Filters Card */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 3 }}>
          Filtreler
        </div>
        <div style={{ fontSize: 12, color: FAINT, marginBottom: 14 }}>
          Kategori bazlı veya cari bazlı raporu seçin
        </div>

        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* Rapor Modu (sekme/toggle) */}
          <div>
            <label style={labelStyle}>Rapor Modu</label>
            <div
              style={{
                display: 'inline-flex',
                background: '#f1f4f9',
                borderRadius: 8,
                padding: 3,
              }}
            >
              <button
                type="button"
                onClick={() => setMode('category')}
                style={mode === 'category' ? pillActive : pillBase}
              >
                Kategori Bazlı
              </button>
              <button
                type="button"
                onClick={() => setMode('customer')}
                style={mode === 'customer' ? pillActive : pillBase}
              >
                Cari Bazlı
              </button>
            </div>
          </div>

          {/* Kategori / Cari arama (moda gore) */}
          {mode === 'category' ? (
            <div>
              <label style={labelStyle}>Kategori Ara</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    strokeWidth={2}
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: 11,
                      color: FAINT,
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    placeholder="Kategori kodu veya adı ile ara"
                    value={categorySearch}
                    onChange={(e) => {
                      setCategorySearch(e.target.value);
                      setCategoryCode('');
                      setCategoryName('');
                    }}
                    style={{ ...inputStyle, paddingLeft: 30 }}
                  />
                  {categorySearching && (
                    <span
                      style={{ position: 'absolute', right: 10, top: 11, fontSize: 11, color: FAINT }}
                    >
                      Aranıyor...
                    </span>
                  )}
                </div>
                {!categoryCode && categoryOptions.length > 0 && (
                  <div style={dropdownWrap}>
                    {categoryOptions.map((item, index) => (
                      <button
                        type="button"
                        key={`${item.categoryCode}-${index}`}
                        onClick={() => handleSelectCategory(item)}
                        style={dropdownItem}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>
                          {item.categoryCode}
                        </div>
                        <div style={{ fontSize: 11, color: FAINT }}>{item.categoryName || '-'}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {categoryCode && (
                <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>
                  Seçilen kategori: {categoryCode} {categoryName ? `- ${categoryName}` : ''}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Cari Ara</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    strokeWidth={2}
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: 11,
                      color: FAINT,
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    placeholder="Kod veya isim ile ara"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setCustomerCode('');
                      setCustomerName('');
                    }}
                    style={{ ...inputStyle, paddingLeft: 30 }}
                  />
                  {customerSearching && (
                    <span
                      style={{ position: 'absolute', right: 10, top: 11, fontSize: 11, color: FAINT }}
                    >
                      Aranıyor...
                    </span>
                  )}
                </div>
                {!customerCode && customerOptions.length > 0 && (
                  <div style={dropdownWrap}>
                    {customerOptions.map((item, index) => {
                      const parsed = parseCustomerOption(item);
                      if (!parsed.code) return null;
                      return (
                        <button
                          type="button"
                          key={`${parsed.code}-${index}`}
                          onClick={() => handleSelectCustomer(item)}
                          style={dropdownItem}
                        >
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>
                            {parsed.code}
                          </div>
                          <div style={{ fontSize: 11, color: FAINT }}>{parsed.name || '-'}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {customerName && (
                <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>
                  Seçilen cari: {customerName}
                </div>
              )}
            </div>
          )}

          {/* Alim Yok Suresi */}
          <div>
            <label style={labelStyle}>Alım Yok Süresi (Ay)</label>
            <select
              value={inactiveMonths}
              onChange={(e) => setInactiveMonths(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="2">Son 2 Ay</option>
              <option value="3">Son 3 Ay</option>
              <option value="4">Son 4 Ay</option>
              <option value="6">Son 6 Ay</option>
              <option value="12">Son 12 Ay</option>
            </select>
          </div>

          {/* Başka kategorilerde aktif cari filtresi */}
          <div>
            <label style={labelStyle}>Başka Kategorilerde Aktif Cari</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={activeFilterEnabled}
                onChange={(e) => setActiveFilterEnabled(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: PRIMARY, flex: 'none' }}
              />
              <input
                type="number"
                min="1"
                value={activeCustomerMonths}
                onChange={(e) => setActiveCustomerMonths(e.target.value)}
                disabled={!activeFilterEnabled}
                style={{
                  ...inputStyle,
                  width: 90,
                  opacity: activeFilterEnabled ? 1 : 0.6,
                }}
              />
              <span style={{ fontSize: 11, color: FAINT }}>ay içinde herhangi bir satışı olan</span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Sektör</label>
            <select
              value={sectorCode}
              onChange={(e) => setSectorCode(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Tüm sektörler</option>
              {sectorOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Min. Geçmiş Evrak</label>
            <input
              type="number"
              min="1"
              value={minHistoricalDocumentCount}
              onChange={(e) => setMinHistoricalDocumentCount(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Min. Geçmiş Ciro</label>
            <input
              type="number"
              min="0"
              step="1000"
              value={minHistoricalAmount}
              onChange={(e) => setMinHistoricalAmount(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#f8fafc',
            color: MUTED,
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          Bu ekran yalnız daha önce alınmış bir kategori-cari bağının kesilmesini gösterir.
          Seçili kategoriyi hiç almamış cariler için “Yeni Kategori Kazandırma Fırsatları” raporunu kullanın.
        </div>

        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={runReport}
            style={{
              ...headBtn,
              height: 38,
              background: PRIMARY,
              color: '#fff',
              border: 'none',
            }}
          >
            Raporu Getir
          </button>
        </div>
      </div>

      {/* Metadata kartlari (Mod / Alim Kesilme Araligi / Secim) */}
      {metadata && (
        <div className="mb-[18px] grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Mod</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: INK, marginTop: 5 }}>
              {metadata.mode === 'category' ? 'Kategori Bazlı' : 'Cari Bazlı'}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Alım Kesilme Aralığı</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginTop: 5 }}>
              {metadata.inactiveStartDate} - {metadata.endDate}
            </div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 3 }}>
              {metadata.inactiveMonths} aydır alım yok
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Seçim</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginTop: 5 }}>
              {metadata.category
                ? `${metadata.category.categoryCode} - ${metadata.category.categoryName || '-'}`
                : metadata.customer
                  ? `${metadata.customer.customerCode} - ${metadata.customer.customerName || '-'}`
                  : '-'}
            </div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 3 }}>
              Aktif cari filtresi:{' '}
              {metadata.activeCustomerMonths ? `Son ${metadata.activeCustomerMonths} ay` : 'Yok'}
            </div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 3 }}>
              Sektör: {metadata.sectorCode || 'Tümü'} · Min. evrak:{' '}
              {metadata.minHistoricalDocumentCount || 1} · Min. ciro:{' '}
              {metadata.minHistoricalAmount ? formatCurrency(metadata.minHistoricalAmount) : 'Yok'}
            </div>
          </div>
        </div>
      )}

      {/* Ozet metrik kartlari */}
      {summary && (
        <div className="mb-[18px] grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Kesilen Kategori-Cari Bağı</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: INK, marginTop: 5 }}>
              {summary.totalRows}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Etkilenen Cari</div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: INK,
                marginTop: 5,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Users size={20} strokeWidth={2} style={{ color: PRIMARY }} />
              {summary.affectedCustomers}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Başka Kategoride Aktif</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: INK, marginTop: 5 }}>
              {summary.activeOutsideCategoryCustomers}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Geçmiş Kategori Cirosu</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: EMERALD, marginTop: 7 }}>
              {formatCurrency(summary.historicalRevenue)}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Ort. Alımsız Gün</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: INK, marginTop: 5 }}>
              {summary.averageInactiveDays ?? '-'}
            </div>
          </div>
        </div>
      )}

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
        ) : error ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <AlertTriangle
              size={32}
              strokeWidth={2}
              style={{ margin: '0 auto 16px', color: RED, display: 'block' }}
            />
            <p style={{ color: RED, margin: 0 }}>{error}</p>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Layers
              size={32}
              strokeWidth={2}
              style={{ margin: '0 auto 10px', color: FAINT, display: 'block' }}
            />
            <p style={{ color: MUTED, margin: 0 }}>Veri bulunamadı</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: MIN_W }}>
                {/* Header row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: GRID,
                    gap: 9,
                    padding: '11px 16px',
                    background: TABLE_HEAD_BG,
                    borderBottom: `1px solid ${SOFT_LINE}`,
                    alignItems: 'center',
                  }}
                >
                  {tableMode === 'category' ? (
                    <>
                      <SortHead field="customerCode" label="Cari Kodu" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                      <SortHead field="customerName" label="Cari Adı" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                      <SortHead field="customerSectorCode" label="Sektör Kodu" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                      <SortHead field="categoryCode" label="Kategori" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                    </>
                  ) : (
                    <>
                      <SortHead field="categoryCode" label="Kategori Kodu" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                      <SortHead field="categoryName" label="Kategori Adı" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                      <SortHead field="customerSectorCode" label="Sektör Kodu" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                    </>
                  )}
                  <SortHead field="lastPurchaseDate" label="Son Alım Tarihi" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHead field="customerLastSaleDate" label="Cari Son Satış" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHead field="historicalDocumentCount" label="Geçmiş Evrak" align="right" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHead field="historicalQuantity" label="Geçmiş Miktar" align="right" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHead field="historicalAmount" label="Geçmiş Tutar" align="right" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                  <span
                    style={{
                      textAlign: 'right',
                      fontSize: 10,
                      fontWeight: 600,
                      color: FAINT,
                      textTransform: 'uppercase',
                      letterSpacing: '.02em',
                    }}
                  >
                    Detay
                  </span>
                </div>

                {/* Rows */}
                {rows.map((row, index) => {
                  const rowKey = getRowKey(row, index);
                  const detailOpen = openDetailKey === rowKey;
                  const detailLoading = detailLoadingKey === rowKey;
                  const detailItems = detailsByKey[rowKey] || [];

                  return (
                    <Fragment key={rowKey}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: GRID,
                          gap: 9,
                          padding: '12px 16px',
                          borderTop: `1px solid ${ROW_LINE}`,
                          fontSize: 11.5,
                          color: INK,
                          alignItems: 'center',
                          background: detailOpen ? '#f8fafc' : undefined,
                        }}
                      >
                        {tableMode === 'category' ? (
                          <>
                            <span style={{ fontFamily: "'Roboto Mono', monospace", color: MUTED }}>
                              {row.customerCode || '-'}
                            </span>
                            <span
                              style={{
                                fontWeight: 500,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={row.customerName || '-'}
                            >
                              {row.customerName || '-'}
                            </span>
                            <span style={{ fontFamily: "'Roboto Mono', monospace", color: MUTED }}>
                              {row.customerSectorCode || '-'}
                            </span>
                            <span style={{ fontFamily: "'Roboto Mono', monospace", color: MUTED }}>
                              {row.categoryCode || '-'}
                            </span>
                          </>
                        ) : (
                          <>
                            <span style={{ fontFamily: "'Roboto Mono', monospace", color: MUTED }}>
                              {row.categoryCode || '-'}
                            </span>
                            <span
                              style={{
                                fontWeight: 500,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={row.categoryName || '-'}
                            >
                              {row.categoryName || '-'}
                            </span>
                            <span style={{ fontFamily: "'Roboto Mono', monospace", color: MUTED }}>
                              {row.customerSectorCode || '-'}
                            </span>
                          </>
                        )}
                        <div style={{ color: MUTED }}>
                          <div>{row.lastPurchaseDate || '-'}</div>
                          <div
                            style={{
                              fontSize: 10.5,
                              color: row.customerActiveOutsideCategory ? EMERALD : FAINT,
                              marginTop: 2,
                            }}
                          >
                            {row.daysSinceCategoryPurchase !== null
                              ? `${row.daysSinceCategoryPurchase} gün`
                              : '-'}
                            {row.customerActiveOutsideCategory ? ' · diğer kategorilerde aktif' : ''}
                          </div>
                        </div>
                        <span style={{ color: MUTED }}>{row.customerLastSaleDate || '-'}</span>
                        <span style={cellRight}>{row.historicalDocumentCount}</span>
                        <span style={cellRight}>
                          {Number(row.historicalQuantity || 0).toLocaleString('tr-TR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span style={{ ...cellRight, fontWeight: 600, color: EMERALD }}>
                          {formatCurrency(Number(row.historicalAmount || 0))}
                        </span>
                        <span style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => toggleDetail(row, index)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '5px 10px',
                              border: `1px solid ${detailOpen ? PRIMARY : LINE}`,
                              borderRadius: 7,
                              background: detailOpen ? '#eef2fa' : '#fff',
                              color: PRIMARY,
                              fontSize: 11,
                              fontWeight: 600,
                              fontFamily: 'inherit',
                              cursor: 'pointer',
                            }}
                          >
                            {detailOpen ? (
                              <ChevronUp size={13} strokeWidth={2} />
                            ) : (
                              <ChevronDown size={13} strokeWidth={2} />
                            )}
                            {detailOpen ? 'Detayı Kapat' : 'Detay Aç'}
                          </button>
                        </span>
                      </div>

                      {detailOpen && (
                        <div
                          style={{
                            borderTop: `1px solid ${ROW_LINE}`,
                            background: '#f8fafc',
                            padding: '12px 16px',
                          }}
                        >
                          {detailLoading ? (
                            <div style={{ fontSize: 12, color: MUTED, padding: '4px 0' }}>
                              Detay yükleniyor...
                            </div>
                          ) : detailItems.length === 0 ? (
                            <div style={{ fontSize: 12, color: MUTED, padding: '4px 0' }}>
                              Bu satır için detay bulunamadı.
                            </div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <div
                                style={{
                                  background: '#fff',
                                  border: `1px solid ${LINE}`,
                                  borderRadius: 10,
                                  overflow: 'hidden',
                                  minWidth: 760,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns:
                                      '1.1fr 2fr 1fr 1fr 0.8fr 1fr 1.1fr',
                                    gap: 9,
                                    padding: '9px 14px',
                                    background: TABLE_HEAD_BG,
                                    borderBottom: `1px solid ${SOFT_LINE}`,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: FAINT,
                                    textTransform: 'uppercase',
                                    letterSpacing: '.02em',
                                  }}
                                >
                                  <span>Ürün Kodu</span>
                                  <span>Ürün Adı</span>
                                  <span>İlk Alım</span>
                                  <span>Son Alım</span>
                                  <span style={cellRight}>Evrak</span>
                                  <span style={cellRight}>Miktar</span>
                                  <span style={cellRight}>Tutar</span>
                                </div>
                                {detailItems.map((item, detailIndex) => (
                                  <div
                                    key={`${rowKey}-detail-${detailIndex}`}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns:
                                        '1.1fr 2fr 1fr 1fr 0.8fr 1fr 1.1fr',
                                      gap: 9,
                                      padding: '9px 14px',
                                      borderTop: `1px solid ${ROW_LINE}`,
                                      fontSize: 11,
                                      color: INK,
                                      alignItems: 'center',
                                    }}
                                  >
                                    <span style={{ fontFamily: "'Roboto Mono', monospace", color: MUTED }}>
                                      {item.productCode}
                                    </span>
                                    <span
                                      style={{
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                      title={item.productName}
                                    >
                                      {item.productName}
                                    </span>
                                    <span style={{ color: MUTED }}>{item.firstPurchaseDate || '-'}</span>
                                    <span style={{ color: MUTED }}>{item.lastPurchaseDate || '-'}</span>
                                    <span style={cellRight}>{item.documentCount}</span>
                                    <span style={cellRight}>
                                      {Number(item.totalQuantity || 0).toLocaleString('tr-TR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </span>
                                    <span style={{ ...cellRight, fontWeight: 600 }}>
                                      {formatCurrency(Number(item.totalAmount || 0))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </Fragment>
                  );
                })}
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
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
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
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
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
