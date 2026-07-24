'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Users,
  Lightbulb,
  Search,
  Target,
  CheckCircle2,
} from 'lucide-react';
import { SalesDecisionReportGuide } from '@/components/reports/SalesDecisionReportGuide';
import { SALES_DECISION_REPORTS } from '@/lib/reports/salesDecisionReports';
import { formatCurrency } from '@/lib/utils/format';
import { useKategoriFirsat } from './useKategoriFirsat';

/**
 * Yeni gorunum: Kategori Firsat Onerileri raporu.
 * Tum mantik useKategoriFirsat hook'undan gelir; hicbir handler/kolon/filtre/
 * ozet/autocomplete/drill(<details>) dusurulmemistir.
 *
 * Tasarim referansi: design HTML generic-report sablonu (category-opportunity) +
 * brief 4.11.14. Genel rapor stili: beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi bg #f8fafc; primary #15356b; ink #14223b/#51607a/#8b97ac.
 *
 * Not: Mockup'taki "Aksiyon" kolonu / "Bana Atananlar" toolbar / Potansiyel-Ort.Skor
 * metrikleri klasik ekranda YOK; uydurulmamistir. Sadece mevcut state'ten gelen
 * gercek alanlar cizilmistir.
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const ROW_LINE = '#f1f4f9';
const TABLE_HEAD_BG = '#f8fafc';
const EMERALD = '#047857';
const RED = '#b91c1c';
const REPORT_DEFINITION = SALES_DECISION_REPORTS.categoryOpportunity;

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
  padding: 15,
};

const cellRight: React.CSSProperties = { textAlign: 'right' };

// Autocomplete dropdown stilleri
const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 20,
  marginTop: 4,
  width: '100%',
  borderRadius: 8,
  border: `1px solid ${LINE}`,
  background: '#fff',
  boxShadow: '0 6px 20px rgba(20,34,59,.08)',
  maxHeight: 240,
  overflow: 'auto',
};

const dropdownItem: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 12.5,
  color: INK,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const monoStyle: React.CSSProperties = {
  fontFamily: "'Roboto Mono', monospace",
  fontSize: 11,
};

const formatMetadataDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('tr-TR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

export default function KategoriFirsatNew() {
  const {
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
    customerOptions,
    customerSearching,
    lookbackMonths,
    setLookbackMonths,
    minPairCount,
    setMinPairCount,
    sectorCode,
    setSectorCode,
    sectorOptions,
    minOpportunityScore,
    setMinOpportunityScore,
    minRecommendationCount,
    setMinRecommendationCount,
    limit,
    setLimit,
    submitted,
    rows,
    summary,
    metadata,
    loading,
    error,
    parseCustomerOption,
    handleSelectCustomer,
    handleSelectCategory,
    fetchReport,
    runReport,
  } = useKategoriFirsat();

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
            <Sparkles size={22} strokeWidth={2} style={{ color: PRIMARY }} />
            {REPORT_DEFINITION.title}
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            {REPORT_DEFINITION.description}
          </div>
        </div>

        <button
          type="button"
          onClick={() => submitted && fetchReport(submitted)}
          disabled={!submitted || loading}
          style={{
            ...headBtn,
            opacity: !submitted || loading ? 0.5 : 1,
            cursor: !submitted || loading ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={15} strokeWidth={2} className={loading ? 'animate-spin' : undefined} />
          Yenile
        </button>
      </div>

      <SalesDecisionReportGuide active="categoryOpportunity" />

      {/* Filters card */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 3 }}>Filtreler</div>
        <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 14 }}>
          Kategori zorunlu, cari filtre opsiyoneldir
        </div>

        {/* Kategori + Cari autocomplete */}
        <div className="mb-3.5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Kategori autocomplete */}
          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>Kategori (kod veya ad)</label>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                strokeWidth={2}
                style={{ position: 'absolute', left: 10, top: 11, color: FAINT, pointerEvents: 'none' }}
              />
              <input
                 value={categorySearch}
                 onChange={(e) => {
                   setCategorySearch(e.target.value);
                   setCategoryCode('');
                   setCategoryName('');
                 }}
                placeholder="Örn: KARTON BARDAK veya kategori kodu"
                style={{ ...inputStyle, paddingLeft: 30 }}
              />
            </div>
            {categorySearching && (
              <div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>Kategori aranıyor...</div>
            )}
            {categoryOptions.length > 0 && (
              <div style={dropdownStyle}>
                {categoryOptions.map((item) => (
                  <button
                    key={item.categoryCode}
                    type="button"
                    style={dropdownItem}
                    onClick={() => handleSelectCategory(item)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = TABLE_HEAD_BG)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ ...monoStyle, color: INK, fontWeight: 600 }}>{item.categoryCode}</span>
                    <span style={{ color: MUTED }}> - {item.categoryName || '-'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cari autocomplete */}
          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>Cari filtresi (opsiyonel)</label>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                strokeWidth={2}
                style={{ position: 'absolute', left: 10, top: 11, color: FAINT, pointerEvents: 'none' }}
              />
              <input
                 value={customerSearch}
                 onChange={(e) => {
                   setCustomerSearch(e.target.value);
                   setCustomerCode('');
                 }}
                placeholder="Sadece tek cari için filtrelemek isterseniz seçin"
                style={{ ...inputStyle, paddingLeft: 30 }}
              />
            </div>
            {customerSearching && (
              <div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>Cari aranıyor...</div>
            )}
            {customerOptions.length > 0 && (
              <div style={dropdownStyle}>
                {customerOptions.map((item, index) => {
                  const parsed = parseCustomerOption(item);
                  return (
                    <button
                      key={`${parsed.code}-${index}`}
                      type="button"
                      style={dropdownItem}
                      onClick={() => handleSelectCustomer(item)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = TABLE_HEAD_BG)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {parsed.label || '-'}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Numeric filters + Calistir */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label style={labelStyle}>Bakış süresi (ay)</label>
            <input value={lookbackMonths} onChange={(e) => setLookbackMonths(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Min ortak evrak</label>
            <input value={minPairCount} onChange={(e) => setMinPairCount(e.target.value)} style={inputStyle} />
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
            <label style={labelStyle}>Min kanıt skoru</label>
            <input
              type="number"
              min="0"
              value={minOpportunityScore}
              onChange={(e) => setMinOpportunityScore(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Min öneri sayısı</label>
            <input
              type="number"
              min="1"
              value={minRecommendationCount}
              onChange={(e) => setMinRecommendationCount(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Cari limiti</label>
            <input value={limit} onChange={(e) => setLimit(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={runReport}
              disabled={loading}
              style={{
                ...headBtn,
                width: '100%',
                justifyContent: 'center',
                background: PRIMARY,
                color: '#fff',
                border: 'none',
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Çalışıyor...' : 'Raporu Çalıştır'}
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#f8fafc',
            color: MUTED,
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          Bu rapor seçili kategoriyi tüm satış geçmişinde hiç almamış carileri gösterir.
          Daha önce alıp bırakan cariler “Kategori-Cari Alım Kesintileri” raporundadır.
        </div>

        {/* Secili filtre ozeti */}
        {(categoryCode || categoryName || customerCode) && (
          <div style={{ fontSize: 11.5, color: FAINT, marginTop: 12 }}>
            Seçili kategori: {categoryCode || '-'} {categoryName ? `- ${categoryName}` : ''}
            {customerCode ? ` / Cari filtresi: ${customerCode}` : ''}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            ...cardStyle,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            padding: 16,
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: RED,
            fontSize: 13,
          }}
        >
          <AlertTriangle size={16} strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      {/* Metadata */}
      {metadata && (
        <div style={{ ...cardStyle, padding: 16, marginBottom: 18, fontSize: 12.5, color: MUTED }}>
          <div style={{ marginBottom: 6 }}>
            <strong style={{ color: INK }}>Kategori:</strong> {metadata.category.categoryCode} -{' '}
            {metadata.category.categoryName || '-'} ({metadata.category.productCount} ürün)
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong style={{ color: INK }}>Dönem:</strong> {metadata.startDate} - {metadata.endDate} /{' '}
            {metadata.lookbackMonths} ay
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong style={{ color: INK }}>Min ortak evrak:</strong> {metadata.minPairCount}
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong style={{ color: INK }}>Cari filtresi:</strong>{' '}
            {metadata.customerFilterCode || 'Yok (otomatik cari tarama)'}
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong style={{ color: INK }}>Sektör / sonuç eşiği:</strong>{' '}
            {metadata.sectorCode || 'Tümü'} / skor {metadata.minOpportunityScore || 0} / öneri{' '}
            {metadata.minRecommendationCount || 1}
          </div>
          <div>
             <strong style={{ color: INK }}>İlişki kanıtı:</strong>{' '}
             {metadata.associationWindowStart && metadata.associationWindowEnd
               ? `${metadata.associationWindowStart} - ${metadata.associationWindowEnd}`
               : 'Pencere bilgisi yok'}{' '}
             · {metadata.candidateSourceProductCount} kanıt üretebilen kaynak ürün · Son güncelleme:{' '}
             {formatMetadataDateTime(metadata.associationUpdatedAt)}
           </div>
         </div>
       )}

       {/* Summary cards */}
       {summary && (
         <div className="mb-[18px] grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
           <div style={summaryCard}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: FAINT }}>
               <Search size={14} strokeWidth={2} style={{ color: FAINT }} />
               Taranan cari
             </div>
             <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
               {summary.scannedCustomers}
             </div>
           </div>

           <div style={summaryCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: FAINT }}>
              <Target size={14} strokeWidth={2} style={{ color: FAINT }} />
              Hiç almamış uygun cari
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
              {summary.eligibleCustomers}
            </div>
          </div>
          <div style={summaryCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: FAINT }}>
              <Users size={14} strokeWidth={2} style={{ color: FAINT }} />
              Öneri çıkan cari
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
              {summary.totalCustomers}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: FAINT }}>
              <Lightbulb size={14} strokeWidth={2} style={{ color: FAINT }} />
              Toplam öneriler
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: PRIMARY, marginTop: 5 }}>
              {summary.totalRecommendations}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: FAINT }}>
              <CheckCircle2 size={14} strokeWidth={2} style={{ color: FAINT }} />
              Öneri kapsaması
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: INK, marginTop: 5 }}>
              %{summary.coverageRate}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: FAINT }}>
              <Sparkles size={14} strokeWidth={2} style={{ color: FAINT }} />
              Ortalama kanıt skoru
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: PRIMARY, marginTop: 5 }}>
              {summary.averageOpportunityScore}
            </div>
          </div>

          <div style={summaryCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: FAINT }}>
              <CheckCircle2 size={14} strokeWidth={2} style={{ color: FAINT }} />
              Kategoriyi zaten alan
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: EMERALD, marginTop: 5 }}>
              {summary.excludedBecauseAlreadyBoughtCategory}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {submitted && !loading && (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          {/* Card header */}
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Cari Bazlı Öneri Listesi</div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 3 }}>
              Seçili kategoriyi hiç almamış cariler. Kanıt skoru parasal değer değil;
              ortak evrak gücü ile carinin kaynak ürün alış sıklığını birleştirir.
            </div>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center' }}>
              <Lightbulb size={30} strokeWidth={2} style={{ margin: '0 auto 10px', color: FAINT, display: 'block' }} />
              <p style={{ color: MUTED, margin: 0, fontSize: 13 }}>Uygun fırsat bulunamadı.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 940 }}>
                {/* Header row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 1fr 130px 100px 2.6fr',
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
                  <span>Sektör / Kaynak Aktivite</span>
                  <span style={cellRight}>Kanıt Skoru</span>
                  <span style={cellRight}>Öneri Sayısı</span>
                  <span>Öne Çıkan Öneriler</span>
                </div>

                {/* Rows */}
                {rows.map((row) => (
                  <Fragment key={row.customerCode}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.4fr 1fr 130px 100px 2.6fr',
                        gap: 10,
                        padding: '12px 16px',
                        borderTop: `1px solid ${ROW_LINE}`,
                        fontSize: 12,
                        color: INK,
                        alignItems: 'start',
                      }}
                    >
                     <div>
                       <div style={{ ...monoStyle, color: MUTED }}>{row.customerCode}</div>
                       <div style={{ fontSize: 12.5, color: INK, fontWeight: 500, marginTop: 2 }}>
                         {row.customerName || '-'}
                       </div>
                     </div>
                     <div style={{ color: MUTED }}>
                       <div>{row.customerSectorCode || '-'}</div>
                       <div style={{ fontSize: 10.5, color: FAINT, marginTop: 3 }}>
                         Son: {row.lastSourcePurchaseDate || '-'} · {row.sourceDocumentCount} ürün-evrak sinyali
                       </div>
                       <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>
                         Kaynak ciro: {formatCurrency(row.sourceRevenue || 0)}
                       </div>
                     </div>
                      <span style={{ ...cellRight, fontWeight: 700, color: PRIMARY }}>
                        {row.totalOpportunityScore}
                      </span>
                      <span style={{ ...cellRight, fontWeight: 500 }}>{row.recommendationCount}</span>
                     <div>
                       <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                         {row.recommendations.slice(0, 3).map((item) => (
                            <div key={`${row.customerCode}-${item.recommendedProductCode}`} style={{ fontSize: 11.5 }}>
                              <span style={{ ...monoStyle, color: MUTED }}>{item.recommendedProductCode}</span>
                              <span style={{ color: INK }}> - {item.recommendedProductName}</span>
                              <span style={{ color: FAINT }}> (skor: {item.weightedScore})</span>
                            </div>
                         ))}
                       </div>
                     </div>
                    </div>

                    {/* Drill: <details> Kategori detaylari */}
                    <div
                      style={{
                        borderTop: `1px solid ${ROW_LINE}`,
                        background: '#fafbfd',
                        padding: '8px 16px',
                      }}
                    >
                      <details>
                        <summary
                          style={{
                            cursor: 'pointer',
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: MUTED,
                            listStyle: 'none',
                          }}
                        >
                          Kategori detayları
                        </summary>
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {row.recommendations.map((item) => (
                            <div
                              key={`${row.customerCode}-detail-${item.recommendedProductCode}`}
                              style={{
                                fontSize: 11.5,
                                border: `1px solid ${LINE}`,
                                borderRadius: 8,
                                padding: 10,
                                background: '#fff',
                              }}
                            >
                              <div>
                                <span style={{ ...monoStyle, color: INK, fontWeight: 600 }}>
                                  {item.recommendedProductCode}
                                </span>
                                <span style={{ color: INK }}> - {item.recommendedProductName}</span>
                                <span style={{ color: FAINT }}>
                                  {' '}
                                  (skor: {item.weightedScore}, bağlantı: {item.associationDocumentCount}, baz:{' '}
                                  {item.sourceProductCount})
                                </span>
                              </div>
                              <div style={{ marginTop: 5, color: MUTED }}>
                                {item.sourceProducts.map((source) => (
                                  <div
                                    key={`${row.customerCode}-${item.recommendedProductCode}-${source.productCode}`}
                                    style={{ marginTop: 2 }}
                                  >
                                    {source.productCode} - {source.productName} (ortak: {source.pairCount}, cari evrak:{' '}
                                    {source.customerDocumentCount})
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
