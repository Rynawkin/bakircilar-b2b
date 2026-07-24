'use client';

import Link from 'next/link';
import {
  ChevronRight,
  RefreshCw,
  Download,
  Package,
  Users,
  AlertTriangle,
  ListFilter,
  StickyNote,
  Megaphone,
  FileText,
  CircleDollarSign,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SalesDecisionReportGuide } from '@/components/reports/SalesDecisionReportGuide';
import { SALES_DECISION_REPORTS } from '@/lib/reports/salesDecisionReports';
import { useTamamlayiciEksik, type ComplementMissingItem } from './useTamamlayiciEksik';

/**
 * Yeni gorunum: Tamamlayici Urun Eksikleri raporu.
 * Tum mantik useTamamlayiciEksik hook'undan gelir; HICBIR handler/kolon/filtre/
 * ozet-kart/metadata/satir-aksiyon (Not Ekle / Kampanya Oner / Teklif Olustur) /
 * Excel export / Yenile / sayfalama / modal DUSURULMEMISTIR.
 *
 * Tasarim referansi: design HTML #scr-genrep (data-screen-label="Rapor") genel
 * rapor stili + brief 4.11.6. Beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac;
 * kar-marji benzeri renk esigi metrik/gelir vurgusu icin emerald/amber/red.
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const FIELD_LINE = '#e3e8f0';
const SOFT_LINE = '#eef1f6';
const ROW_LINE = '#f1f4f9';
const TABLE_HEAD_BG = '#fafbfd';
const EMERALD = '#047857';
const AMBER = '#b45309';
const RED = '#b91c1c';
const REPORT_DEFINITION = SALES_DECISION_REPORTS.complementMissing;

// Tablo grid sablonu: basliklar ve satirlar ayni grid'i kullanir.
// Kod | Ad (cari/urun moda gore) | Evrak | Eksik Tamamlayicilar | Potansiyel Aylik Gelir | Adet | Aksiyon
const GRID = '1.1fr 1.7fr 70px 2.4fr 1.3fr 70px 150px';

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

const summaryCard: React.CSSProperties = {
  ...cardStyle,
  padding: 15,
};

const metaCard: React.CSSProperties = {
  ...cardStyle,
  padding: 14,
};

const cellRight: React.CSSProperties = { textAlign: 'right' };

// Satir-aksiyon butonlari (kucuk, tablo icinde)
const rowActionBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  height: 28,
  padding: '0 9px',
  border: `1px solid ${LINE}`,
  borderRadius: 7,
  background: '#fff',
  color: MUTED,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export default function TamamlayiciEksikNew() {
  const {
    mode,
    setMode,
    matchMode,
    setMatchMode,
    productSearch,
    setProductSearch,
    productCode,
    setProductCode,
    productName,
    setProductName,
    productOptions,
    productSearching,
    customerSearch,
    setCustomerSearch,
    customerCode,
    setCustomerCode,
    customerName,
    setCustomerName,
    customerOptions,
    customerSearching,
    periodMonths,
    setPeriodMonths,
    sectorCode,
    setSectorCode,
    sectorOptions,
    salesRepId,
    setSalesRepId,
    salesRepOptions,
    minDocumentEnabled,
    setMinDocumentEnabled,
    minDocumentCount,
    setMinDocumentCount,
    submitted,
    rows,
    summary,
    metadata,
    loading,
    error,
    page,
    setPage,
    totalPages,
    exporting,
    actionRow,
    actionType,
    actionNote,
    setActionNote,
    actionSaving,
    matchModeValue,
    matchModeLabel,
    showProductMode,
    showProductTable,
    parseProductOption,
    parseCustomerOption,
    formatMoney,
    formatQuantity,
    handleSelectProduct,
    handleSelectCustomer,
    handleRunReport,
    fetchReport,
    handleExport,
    openActionModal,
    closeActionModal,
    handleActionSubmit,
    handleCreateQuote,
  } = useTamamlayiciEksik();

  const revenueEstimateAvailable = matchModeValue === 'product';
  const associationSourceLabel = metadata?.associationSource === 'MIXED'
    ? 'Manuel + otomatik'
    : metadata?.associationSource === 'MANUAL'
      ? 'Manuel tanımlar'
      : metadata?.associationSource === 'AUTO'
        ? 'Otomatik birlikte alım'
        : 'İlişki kaynağı yok';
  const formatMetadataDate = (value?: string | null, withTime = false) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('tr-TR', withTime
      ? { dateStyle: 'short', timeStyle: 'short' }
      : { dateStyle: 'short' });
  };

  const renderMissingList = (items: ComplementMissingItem[]) => {
    if (items.length === 0) return <span style={{ color: FAINT }}>-</span>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => {
          const hasEstimate =
            Number.isFinite(item.estimatedQuantity) ||
            Number.isFinite(item.unitPrice) ||
            Number.isFinite(item.estimatedRevenue);

          return (
            <div key={`${item.productCode}-${item.productName}`} style={{ fontSize: 11.5 }}>
              <div>
                <span
                  style={{
                    fontFamily: "'Roboto Mono', monospace",
                    color: INK,
                    fontWeight: 600,
                  }}
                >
                  {item.productCode}
                </span>
                <span style={{ color: MUTED }}> - {item.productName}</span>
              </div>
              {hasEstimate && (
                <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>
                  {formatQuantity(item.estimatedQuantity)} x {formatMoney(item.unitPrice)} = {formatMoney(item.estimatedRevenue)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

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

      {/* Header: baslik + Raporlara Don + Excel Indir / Yenile */}
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
            {REPORT_DEFINITION.title}
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            {REPORT_DEFINITION.description}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/reports" style={{ textDecoration: 'none' }}>
            <button type="button" style={headBtn}>
              <ChevronRight size={15} strokeWidth={2} style={{ transform: 'rotate(180deg)' }} />
              Raporlara Dön
            </button>
          </Link>
          <button
            type="button"
            onClick={handleExport}
            disabled={!submitted || exporting}
            style={{
              ...headBtn,
              opacity: !submitted || exporting ? 0.55 : 1,
              cursor: !submitted || exporting ? 'not-allowed' : 'pointer',
            }}
          >
            {exporting ? (
              <RefreshCw size={15} strokeWidth={2} className="animate-spin" />
            ) : (
              <Download size={15} strokeWidth={2} />
            )}
            {exporting ? 'Hazırlanıyor...' : 'Excel İndir'}
          </button>
          <button
            type="button"
            onClick={() => submitted && fetchReport(submitted, page)}
            style={{
              ...headBtn,
              background: PRIMARY,
              color: '#fff',
              border: 'none',
              opacity: submitted ? 1 : 0.55,
              cursor: submitted ? 'pointer' : 'not-allowed',
            }}
          >
            <RefreshCw size={15} strokeWidth={2} />
            Yenile
          </button>
        </div>
      </div>

      <SalesDecisionReportGuide active="complementMissing" />

      {/* Filtreler karti */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13.5,
            fontWeight: 600,
            color: INK,
            marginBottom: 4,
          }}
        >
          <ListFilter size={16} strokeWidth={2} style={{ color: MUTED }} />
          Filtreler
        </div>
        <div style={{ fontSize: 12, color: FAINT, marginBottom: 14 }}>
          Rapor modu, temel kod ve tarih aralığı seçin
        </div>

        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* Rapor Modu */}
          <div>
            <label style={labelStyle}>Rapor Modu</label>
            <div
              style={{
                display: 'inline-flex',
                background: '#f1f4f9',
                borderRadius: 8,
                padding: 3,
                gap: 2,
              }}
            >
              <button
                type="button"
                onClick={() => setMode('product')}
                style={{
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: mode === 'product' ? `1px solid #d3deef` : '1px solid transparent',
                  background: mode === 'product' ? '#fff' : 'transparent',
                  color: mode === 'product' ? PRIMARY : FAINT,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Ürün Bazlı
              </button>
              <button
                type="button"
                onClick={() => setMode('customer')}
                style={{
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: mode === 'customer' ? `1px solid #d3deef` : '1px solid transparent',
                  background: mode === 'customer' ? '#fff' : 'transparent',
                  color: mode === 'customer' ? PRIMARY : FAINT,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cari Bazlı
              </button>
            </div>
          </div>

          {/* Eslesme Tipi */}
          <div>
            <label style={labelStyle}>Eşleşme Tipi</label>
            <select
              value={matchMode}
              onChange={(e) => setMatchMode(e.target.value as 'product' | 'category' | 'group')}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="product">Ürün Bazlı</option>
              <option value="category">Kategori Bazlı</option>
              <option value="group">Grup Bazlı</option>
            </select>
          </div>

          {/* Urun / Cari Ara (moda gore) */}
          {showProductMode ? (
            <div>
              <label style={labelStyle}>Ürün Ara</label>
              <div style={{ position: 'relative' }}>
                <input
                  placeholder="Kod veya isim ile ara"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setProductCode('');
                    setProductName('');
                  }}
                  style={inputStyle}
                />
                {productSearching && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: 10,
                      fontSize: 11,
                      color: FAINT,
                    }}
                  >
                    Aranıyor...
                  </div>
                )}
                {!productCode && productOptions.length > 0 && (
                  <div
                    style={{
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
                      boxShadow: '0 12px 32px rgba(12,16,30,.12)',
                    }}
                  >
                    {productOptions.map((item, index) => {
                      const parsed = parseProductOption(item);
                      if (!parsed.code) return null;
                      return (
                        <button
                          type="button"
                          key={`${parsed.code}-${index}`}
                          onClick={() => handleSelectProduct(item)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 12px',
                            border: 'none',
                            borderBottom: `1px solid ${SOFT_LINE}`,
                            background: '#fff',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{parsed.code}</div>
                          <div style={{ fontSize: 11, color: FAINT }}>{parsed.name || '-'} </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {productName && (
                <div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>Seçilen ürün: {productName}</div>
              )}
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Cari Ara</label>
              <div style={{ position: 'relative' }}>
                <input
                  placeholder="Kod veya isim ile ara"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setCustomerCode('');
                    setCustomerName('');
                  }}
                  style={inputStyle}
                />
                {customerSearching && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: 10,
                      fontSize: 11,
                      color: FAINT,
                    }}
                  >
                    Aranıyor...
                  </div>
                )}
                {!customerCode && customerOptions.length > 0 && (
                  <div
                    style={{
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
                      boxShadow: '0 12px 32px rgba(12,16,30,.12)',
                    }}
                  >
                    {customerOptions.map((item, index) => {
                      const parsed = parseCustomerOption(item);
                      if (!parsed.code) return null;
                      return (
                        <button
                          type="button"
                          key={`${parsed.code}-${index}`}
                          onClick={() => handleSelectCustomer(item)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 12px',
                            border: 'none',
                            borderBottom: `1px solid ${SOFT_LINE}`,
                            background: '#fff',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{parsed.code}</div>
                          <div style={{ fontSize: 11, color: FAINT }}>{parsed.name || '-'} </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {customerName && (
                <div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>Seçilen cari: {customerName}</div>
              )}
            </div>
          )}

          {/* Tarih Araligi */}
          <div>
            <label style={labelStyle}>Tarih Aralığı</label>
            <select
              value={String(periodMonths)}
              onChange={(e) => setPeriodMonths(Number(e.target.value) as 6 | 12)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="6">Son 6 Ay</option>
              <option value="12">Son 12 Ay</option>
            </select>
          </div>

          {/* Sektor */}
          <div>
            <label style={labelStyle}>Sektör</label>
            <select
              value={sectorCode}
              onChange={(e) => setSectorCode(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Tüm sektörler</option>
              {sectorOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          {/* Satis Temsilcisi */}
          <div>
            <label style={labelStyle}>Satış Temsilcisi</label>
            <select
              value={salesRepId}
              onChange={(e) => setSalesRepId(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Tüm temsilciler</option>
              {salesRepOptions.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name || rep.email || rep.id}
                </option>
              ))}
            </select>
          </div>

          {/* Minimum Evrak */}
          <div>
            <label style={labelStyle}>Minimum Evrak</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={minDocumentEnabled}
                onChange={(e) => setMinDocumentEnabled(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: PRIMARY }}
              />
              <input
                type="number"
                min="1"
                value={minDocumentCount}
                onChange={(e) => setMinDocumentCount(e.target.value)}
                disabled={!minDocumentEnabled}
                style={{
                  ...inputStyle,
                  width: 110,
                  opacity: minDocumentEnabled ? 1 : 0.55,
                  cursor: minDocumentEnabled ? 'text' : 'not-allowed',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={handleRunReport}
            style={{
              ...headBtn,
              background: PRIMARY,
              color: '#fff',
              border: 'none',
              height: 38,
              padding: '0 18px',
            }}
          >
            Raporu Getir
          </button>
        </div>
      </div>

      {/* Metadata kartlari (rapor calistirildiktan sonra) */}
      {metadata && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 14,
            marginBottom: 16,
          }}
        >
          <div style={metaCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Rapor Modu</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: INK, marginTop: 5 }}>
              {metadata.mode === 'product' ? 'Ürün' : 'Cari'}
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Eşleşme: {matchModeLabel}</div>
          </div>

          <div style={metaCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Temel Kayıt</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginTop: 5 }}>
              {metadata.baseProduct
                ? `${metadata.baseProduct.productCode} - ${metadata.baseProduct.productName}`
                : metadata.customer
                  ? `${metadata.customer.customerCode} - ${metadata.customer.customerName || '-'}`
                  : '-'}
            </div>
          </div>

          <div style={metaCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Aralık</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginTop: 5 }}>
              {metadata.periodMonths} Ay ( {metadata.startDate} - {metadata.endDate} )
            </div>
          </div>

          <div style={metaCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Segment</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginTop: 5 }}>
              Sektör: {metadata.sectorCode || '-'}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
              Temsilci: {metadata.salesRep?.name || metadata.salesRep?.email || '-'}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
              Min evrak: {metadata.minDocumentCount ?? '-'}
            </div>
          </div>

          <div style={metaCard}>
            <div style={{ fontSize: 11.5, color: FAINT }}>Tamamlayıcı İlişki Verisi</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginTop: 5 }}>
              {associationSourceLabel}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
              Otomatik pencere: {formatMetadataDate(metadata.associationWindowStart)} - {formatMetadataDate(metadata.associationWindowEnd)}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
              Son güncelleme: {formatMetadataDate(metadata.associationUpdatedAt, true)}
            </div>
          </div>
        </div>
      )}

      {/* Ozet metrik kartlari */}
      {summary && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 14,
              marginBottom: revenueEstimateAvailable ? 16 : 10,
            }}
          >
            <div style={summaryCard}>
              <div style={{ fontSize: 11.5, color: FAINT }}>Toplam Kayıt</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 6,
                }}
              >
                <Users size={20} strokeWidth={2} style={{ color: PRIMARY }} />
                <span style={{ fontSize: 24, fontWeight: 700, color: INK }}>{summary.totalRows}</span>
              </div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11.5, color: FAINT }}>Eksik Tamamlayıcı</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 6,
                }}
              >
                <AlertTriangle size={20} strokeWidth={2} style={{ color: AMBER }} />
                <span style={{ fontSize: 24, fontWeight: 700, color: INK }}>{summary.totalMissing}</span>
              </div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11.5, color: FAINT }}>Kayıt Başına Ortalama Eksik</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <FileText size={20} strokeWidth={2} style={{ color: PRIMARY }} />
                <span style={{ fontSize: 24, fontWeight: 700, color: INK }}>
                  {summary.averageMissingPerRow.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div style={summaryCard}>
              <div style={{ fontSize: 11.5, color: FAINT }}>Fiyatı Bulunanların Aylık Tahmini</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <CircleDollarSign size={20} strokeWidth={2} style={{ color: revenueEstimateAvailable ? EMERALD : FAINT }} />
                <span style={{ fontSize: revenueEstimateAvailable ? 20 : 14, fontWeight: 700, color: revenueEstimateAvailable ? EMERALD : MUTED }}>
                  {revenueEstimateAvailable ? formatMoney(summary.totalEstimatedRevenue) : 'Hesaplanmıyor'}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 5 }}>
                {revenueEstimateAvailable
                  ? `${summary.pricedMissingItems}/${summary.totalMissing} eksik kalemde fiyat bulundu`
                  : 'Yalnız birebir ürün eşleşmesinde hesaplanır'}
              </div>
            </div>
          </div>

          {!revenueEstimateAvailable && (
            <div
              style={{
                marginBottom: 16,
                borderRadius: 10,
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                padding: '10px 12px',
                fontSize: 11.5,
                lineHeight: 1.5,
                color: '#1e3a8a',
              }}
            >
              Kategori veya grup eşleşmesi bir kapsam boşluğunu gösterir; somut ürün ve müşteri fiyatı seçilmediği için gelir tahmini üretilmez ve doğrudan teklif oluşturulamaz.
            </div>
          )}
        </>
      )}

      {/* Tablo karti */}
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
            <Package
              size={32}
              strokeWidth={2}
              style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }}
            />
            <p style={{ color: MUTED, margin: 0 }}>Veri bulunamadı</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 1080 }}>
                {/* Header row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: GRID,
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
                  {showProductTable ? (
                    <>
                      <span>Cari Kodu</span>
                      <span>Cari Adı</span>
                    </>
                  ) : (
                    <>
                      <span>Ürün Kodu</span>
                      <span>Ürün Adı</span>
                    </>
                  )}
                  <span style={cellRight}>Evrak</span>
                  <span>Eksik Tamamlayıcılar</span>
                  <span style={cellRight}>Fiyatı Bulunan Kalemlerin Aylık Tahmini</span>
                  <span style={cellRight}>Adet</span>
                  <span style={cellRight}>Aksiyon</span>
                </div>

                {/* Rows */}
                {rows.map((row, index) => {
                  const customerCodeValue = showProductTable ? row.customerCode : metadata?.customer?.customerCode;
                  const canCreateQuote =
                    revenueEstimateAvailable &&
                    Boolean(customerCodeValue) &&
                    row.missingComplements.length > 0;
                  const quoteDisabledReason = !revenueEstimateAvailable
                    ? 'Kategori/grup eşleşmesinde önce somut ürün seçilmelidir'
                    : !customerCodeValue
                      ? 'Teklif için cari kodu bulunamadı'
                      : undefined;

                  return (
                    <div
                      key={`${row.customerCode || row.productCode}-${index}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: GRID,
                        gap: 10,
                        padding: '12px 16px',
                        borderTop: `1px solid ${ROW_LINE}`,
                        fontSize: 12,
                        color: INK,
                        alignItems: 'flex-start',
                      }}
                    >
                      {showProductTable ? (
                        <>
                          <span
                            style={{
                              fontFamily: "'Roboto Mono', monospace",
                              fontSize: 11,
                              color: MUTED,
                            }}
                          >
                            {row.customerCode}
                          </span>
                          <span style={{ fontWeight: 500 }}>{row.customerName || '-'}</span>
                        </>
                      ) : (
                        <>
                          <span
                            style={{
                              fontFamily: "'Roboto Mono', monospace",
                              fontSize: 11,
                              color: MUTED,
                            }}
                          >
                            {row.productCode}
                          </span>
                          <span style={{ fontWeight: 500 }}>{row.productName || '-'}</span>
                        </>
                      )}
                      <span style={cellRight}>{row.documentCount ?? '-'}</span>
                      <div>{renderMissingList(row.missingComplements)}</div>
                      <span style={{ ...cellRight, fontWeight: 700, color: row.estimatedRevenue !== null ? EMERALD : FAINT }}>
                        {revenueEstimateAvailable ? formatMoney(row.estimatedRevenue) : 'Hesaplanmıyor'}
                      </span>
                      <span style={{ ...cellRight, fontWeight: 700, color: PRIMARY }}>{row.missingCount}</span>
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: 6,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => openActionModal(row, 'note')}
                            style={rowActionBtn}
                          >
                            <StickyNote size={13} strokeWidth={2} />
                            Not Ekle
                          </button>
                          <button
                            type="button"
                            onClick={() => openActionModal(row, 'campaign')}
                            style={rowActionBtn}
                          >
                            <Megaphone size={13} strokeWidth={2} />
                            Kampanya Öner
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCreateQuote(row)}
                            disabled={!canCreateQuote}
                            title={quoteDisabledReason}
                            style={{
                              ...rowActionBtn,
                              background: PRIMARY,
                              color: '#fff',
                              border: 'none',
                              opacity: canCreateQuote ? 1 : 0.5,
                              cursor: canCreateQuote ? 'pointer' : 'not-allowed',
                            }}
                          >
                            <FileText size={13} strokeWidth={2} />
                            Teklif Oluştur
                          </button>
                        </div>
                      </div>
                    </div>
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

      {/* Aksiyon Modal (Not / Kampanya) — mevcut Modal/Button bilesenleri korunur */}
      <Modal
        isOpen={Boolean(actionType)}
        onClose={closeActionModal}
        title={actionType === 'campaign' ? 'Kampanya Önerisi' : 'Not Ekle'}
        footer={
          <>
            <Button variant="outline" onClick={closeActionModal}>
              İptal
            </Button>
            <Button variant="primary" onClick={handleActionSubmit} isLoading={actionSaving} disabled={actionSaving}>
              Kaydet
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
          {actionRow && (
            <div
              style={{
                borderRadius: 10,
                border: `1px solid ${LINE}`,
                background: '#f8fafc',
                padding: '10px 12px',
              }}
            >
              <div style={{ fontSize: 11, color: FAINT }}>Hedef</div>
              <div style={{ fontWeight: 600, color: INK }}>
                {showProductTable
                  ? `${actionRow.customerCode || '-'} - ${actionRow.customerName || ''}`
                  : `${actionRow.productCode || '-'} - ${actionRow.productName || ''}`}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: FAINT }}>Eksikler</div>
              {renderMissingList(actionRow.missingComplements)}
            </div>
          )}
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 500, color: INK }}>Not</label>
            <textarea
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              rows={4}
              placeholder="Notunuzu yazın"
              style={{
                marginTop: 8,
                width: '100%',
                borderRadius: 8,
                border: `1px solid ${FIELD_LINE}`,
                background: '#fff',
                padding: '8px 12px',
                fontSize: 13,
                color: INK,
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
