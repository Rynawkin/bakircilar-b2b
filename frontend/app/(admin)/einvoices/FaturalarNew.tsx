'use client';

import {
  Upload,
  Download,
  Search,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { CariSelectModal } from '@/components/admin/CariSelectModal';
import { useFaturalar } from './useFaturalar';

// ---- Tasarim tokenlari (referans: Yonetim Paneli "Faturalar" ekrani) ----
const INK = '#14223b';
const INK_SOFT = '#51607a';
const INK_MUTE = '#8b97ac';
const PRIMARY = '#15356b';
const PRIMARY_HOVER = '#1c4585';
const CARD_BORDER = '#e7ebf2';
const FIELD_BORDER = '#e3e8f0';

type BadgeTone = 'green' | 'amber' | 'red';

const TONE_STYLES: Record<BadgeTone, { background: string; color: string; border: string }> = {
  green: { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' },
  amber: { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' },
  red: { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' },
};

// Klasik ile BIREBIR ayni durum->etiket eslemesi (MATCHED/PARTIAL/diger)
const matchBadgeInfo = (status: string): { tone: BadgeTone; label: string } => {
  if (status === 'MATCHED') return { tone: 'green', label: 'Eslesmis' };
  if (status === 'PARTIAL') return { tone: 'amber', label: 'Eksik' };
  return { tone: 'red', label: 'Bulunamadi' };
};

function StatusPill({ status }: { status: string }) {
  const info = matchBadgeInfo(status);
  const s = TONE_STYLES[info.tone];
  const Icon = info.tone === 'green' ? CheckCircle2 : info.tone === 'amber' ? AlertTriangle : XCircle;
  return (
    <span
      style={{
        ...s,
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      <Icon size={12} strokeWidth={2.2} />
      {info.label}
    </span>
  );
}

const GRID_COLS = '44px 1.5fr 1.8fr 1fr 1.2fr 1.2fr 1fr 90px';

export default function FaturalarNew() {
  const {
    formatAmount,
    formatDateShort,
    documents,
    pagination,
    loading,
    loadDocuments,
    bulkDownloading,
    handleBulkDownload,
    selectedIds,
    setSelectedIds,
    selectedCount,
    allSelectedOnPage,
    toggleSelectAll,
    toggleSelection,
    cariList,
    cariModalOpen,
    setCariModalOpen,
    selectedCari,
    setSelectedCari,
    search,
    setSearch,
    invoicePrefix,
    setInvoicePrefix,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    selectedFiles,
    setSelectedFiles,
    uploading,
    uploadResult,
    handleUpload,
    handleDownload,
  } = useFaturalar();

  const fieldStyle: React.CSSProperties = {
    height: 38,
    border: `1px solid ${FIELD_BORDER}`,
    borderRadius: 8,
    padding: '0 11px',
    fontSize: 12.5,
    color: INK,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fff',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: INK_MUTE,
    textTransform: 'uppercase',
    letterSpacing: '.02em',
  };

  return (
    <>
      <div className="container-custom" style={{ padding: '24px 0', color: INK }}>
        {/* Baslik */}
        <div style={{ margin: '0 0 18px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: 0, color: INK }}>
            Faturalar (E-Fatura)
          </h1>
          <div style={{ fontSize: 13, color: INK_MUTE, marginTop: 5 }}>
            E-fatura PDF yukleme, eslestirme ve toplu indirme
          </div>
        </div>

        {/* PDF Yukleme karti */}
        <div
          style={{
            background: '#fff',
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              background: '#eef2fa',
              border: '1px dashed #c3cfe0',
              borderRadius: 12,
              padding: '14px 16px',
              flexWrap: 'wrap',
            }}
          >
            <Upload size={20} color={PRIMARY} strokeWidth={2} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
                style={{ fontSize: 13, color: INK_SOFT, fontFamily: 'inherit', maxWidth: '100%' }}
              />
              <div style={{ fontSize: 12, color: INK_MUTE, marginTop: 4 }}>
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} dosya secildi`
                  : "Coklu e-fatura PDF'i surukleyin veya secin"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFiles([])}
              disabled={selectedFiles.length === 0 || uploading}
              style={{
                background: '#fff',
                border: `1px solid #d8e0ec`,
                borderRadius: 8,
                padding: '9px 15px',
                fontSize: 12.5,
                fontWeight: 500,
                color: INK_SOFT,
                cursor: selectedFiles.length === 0 || uploading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: selectedFiles.length === 0 || uploading ? 0.5 : 1,
              }}
            >
              Temizle
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || uploading}
              style={{
                background: PRIMARY,
                border: 'none',
                borderRadius: 8,
                padding: '9px 15px',
                fontSize: 12.5,
                fontWeight: 600,
                color: '#fff',
                cursor: selectedFiles.length === 0 || uploading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                opacity: selectedFiles.length === 0 || uploading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!(selectedFiles.length === 0 || uploading)) e.currentTarget.style.background = PRIMARY_HOVER;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = PRIMARY;
              }}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              PDF Yukle
            </button>
          </div>

          {/* Yukleme sonucu */}
          {uploadResult && (
            <div
              style={{
                marginTop: 14,
                borderRadius: 12,
                border: `1px solid ${CARD_BORDER}`,
                background: '#fafbfd',
                padding: 14,
                fontSize: 12.5,
                color: INK_SOFT,
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={14} color="#047857" />
                  Yeni: <strong style={{ color: '#047857' }}>{uploadResult.uploaded}</strong>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={14} color={PRIMARY} />
                  Guncel: <strong style={{ color: PRIMARY }}>{uploadResult.updated}</strong>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <XCircle size={14} color="#b91c1c" />
                  Hata: <strong style={{ color: '#b91c1c' }}>{uploadResult.failed}</strong>
                </span>
              </div>
              {uploadResult.results.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {uploadResult.results.slice(0, 6).map((item) => (
                    <div
                      key={item.invoiceNo}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11.5 }}>
                        {item.invoiceNo}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <StatusPill status={item.status} />
                        {item.message && (
                          <span style={{ fontSize: 11.5, color: INK_MUTE }}>{item.message}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {uploadResult.results.length > 6 && (
                    <div style={{ fontSize: 11.5, color: INK_MUTE }}>
                      +{uploadResult.results.length - 6} satir daha
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filtre karti */}
        <div
          style={{
            background: '#fff',
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>Arama</span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 38,
                  border: `1px solid ${FIELD_BORDER}`,
                  borderRadius: 8,
                  padding: '0 12px',
                  background: '#fff',
                }}
              >
                <Search size={15} color="#9aa6b8" strokeWidth={2} />
                <input
                  placeholder="Fatura no veya cari ara…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
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
              </span>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>Fatura Prefix</span>
              <input
                placeholder="Prefix (DEF2026)"
                value={invoicePrefix}
                onChange={(event) => setInvoicePrefix(event.target.value)}
                style={fieldStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>Baslangic Tarihi</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                style={fieldStyle}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>Bitis Tarihi</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                style={fieldStyle}
              />
            </label>
          </div>

          {/* Cari secimi + filtre aksiyonlari */}
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>Cari</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setCariModalOpen(true)}
                  style={{
                    background: '#fff',
                    border: `1px solid #d8e0ec`,
                    borderRadius: 8,
                    padding: '0 14px',
                    height: 38,
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: INK_SOFT,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f6fa')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                >
                  Cari Sec
                </button>
                {selectedCari && (
                  <>
                    <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{selectedCari.code}</span>
                    <span style={{ fontSize: 13, color: INK_SOFT }}>{selectedCari.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedCari(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: INK_MUTE,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 12.5,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <X size={13} /> Temizle
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setInvoicePrefix('');
                  setFromDate('');
                  setToDate('');
                  setSelectedCari(null);
                  loadDocuments(1);
                }}
                style={{
                  background: '#fff',
                  border: `1px solid #d8e0ec`,
                  borderRadius: 8,
                  padding: '0 14px',
                  height: 38,
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: INK_SOFT,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f6fa')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              >
                Filtre Temizle
              </button>
              <button
                type="button"
                onClick={() => loadDocuments(1)}
                disabled={loading}
                style={{
                  background: PRIMARY,
                  border: 'none',
                  borderRadius: 8,
                  padding: '0 16px',
                  height: 38,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#fff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  opacity: loading ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = PRIMARY_HOVER;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = PRIMARY;
                }}
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Listele
              </button>
            </div>
          </div>
        </div>

        {/* Secim cubugu */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            background: '#fff',
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 12.5, color: INK_SOFT, fontWeight: 500 }}>
            {selectedCount > 0 ? `${selectedCount} fatura secili` : 'Fatura secimi yok'}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedCount === 0 || bulkDownloading}
              style={{
                background: '#fff',
                border: `1px solid #d8e0ec`,
                borderRadius: 8,
                padding: '8px 13px',
                fontSize: 12,
                fontWeight: 500,
                color: INK_SOFT,
                cursor: selectedCount === 0 || bulkDownloading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: selectedCount === 0 || bulkDownloading ? 0.5 : 1,
              }}
            >
              Secimi Temizle
            </button>
            <button
              type="button"
              onClick={handleBulkDownload}
              disabled={selectedCount === 0 || bulkDownloading}
              style={{
                background: PRIMARY,
                border: 'none',
                borderRadius: 8,
                padding: '8px 13px',
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                cursor: selectedCount === 0 || bulkDownloading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                opacity: selectedCount === 0 || bulkDownloading ? 0.6 : 1,
              }}
            >
              {bulkDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {bulkDownloading ? 'Indiriliyor...' : 'Secilileri Indir (zip)'}
            </button>
          </div>
        </div>

        {/* Tablo */}
        <div
          style={{
            background: '#fff',
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 880 }}>
              {/* Baslik satiri */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID_COLS,
                  gap: 10,
                  padding: '11px 16px',
                  background: '#fafbfd',
                  borderBottom: '1px solid #eef1f6',
                  fontSize: 10,
                  fontWeight: 600,
                  color: INK_MUTE,
                  textTransform: 'uppercase',
                  alignItems: 'center',
                }}
              >
                <input
                  type="checkbox"
                  checked={allSelectedOnPage}
                  onChange={toggleSelectAll}
                  style={{ width: 15, height: 15, accentColor: PRIMARY }}
                />
                <span>Fatura No</span>
                <span>Cari</span>
                <span>Tarih</span>
                <span style={{ textAlign: 'right' }}>Ara Toplam</span>
                <span style={{ textAlign: 'right' }}>Genel Toplam</span>
                <span style={{ textAlign: 'center' }}>Durum</span>
                <span style={{ textAlign: 'center' }}>PDF</span>
              </div>

              {/* Bos durum */}
              {documents.length === 0 && !loading && (
                <div
                  style={{
                    padding: '36px 16px',
                    textAlign: 'center',
                    fontSize: 13,
                    color: INK_MUTE,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <FileText size={26} color="#c3cfe0" />
                  Kayit bulunamadi.
                </div>
              )}

              {/* Satirlar */}
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: GRID_COLS,
                    gap: 10,
                    padding: '13px 16px',
                    borderTop: '1px solid #f1f4f9',
                    fontSize: 12,
                    color: INK,
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(doc.id)}
                    onChange={() => toggleSelection(doc.id)}
                    disabled={!doc.fileName}
                    style={{
                      width: 15,
                      height: 15,
                      accentColor: PRIMARY,
                      cursor: doc.fileName ? 'pointer' : 'not-allowed',
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 600 }}>
                      {doc.invoiceNo}
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 10.5,
                        color: INK_MUTE,
                        fontFamily: "'Roboto Mono', monospace",
                      }}
                    >
                      VKN: {doc.customerTaxNo || '-'}
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {doc.customerName || '-'}
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: INK_MUTE,
                        fontFamily: "'Roboto Mono', monospace",
                      }}
                    >
                      {doc.customerCode || '-'}
                    </div>
                  </div>
                  <span style={{ color: INK_SOFT }}>
                    {doc.issueDate ? formatDateShort(doc.issueDate) : '-'}
                  </span>
                  <span style={{ textAlign: 'right' }}>{formatAmount(doc.subtotalAmount, doc.currency)}</span>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatAmount(doc.totalAmount, doc.currency)}
                  </span>
                  <span style={{ textAlign: 'center' }}>
                    <StatusPill status={doc.matchStatus} />
                  </span>
                  <span style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      disabled={!doc.fileName}
                      title="PDF indir"
                      style={{
                        width: 32,
                        height: 32,
                        border: `1px solid #d8e0ec`,
                        borderRadius: 7,
                        background: '#fff',
                        cursor: doc.fileName ? 'pointer' : 'not-allowed',
                        color: PRIMARY,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: doc.fileName ? 1 : 0.4,
                      }}
                      onMouseEnter={(e) => {
                        if (doc.fileName) e.currentTarget.style.background = '#eef2fa';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#fff';
                      }}
                    >
                      <Download size={14} />
                    </button>
                  </span>
                </div>
              ))}

              {/* Yukleniyor durumu */}
              {loading && (
                <div
                  style={{
                    padding: '28px 16px',
                    textAlign: 'center',
                    fontSize: 13,
                    color: INK_MUTE,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Loader2 size={16} className="animate-spin" />
                  Yukleniyor...
                </div>
              )}
            </div>
          </div>

          {/* Alt cubuk: toplu indir + pagination */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              padding: '12px 16px',
              borderTop: '1px solid #eef1f6',
            }}
          >
            <button
              type="button"
              onClick={handleBulkDownload}
              disabled={selectedCount === 0 || bulkDownloading}
              style={{
                background: '#fff',
                border: `1px solid #d8e0ec`,
                borderRadius: 8,
                padding: '8px 13px',
                fontSize: 12,
                fontWeight: 500,
                color: INK_SOFT,
                cursor: selectedCount === 0 || bulkDownloading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                opacity: selectedCount === 0 || bulkDownloading ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!(selectedCount === 0 || bulkDownloading)) e.currentTarget.style.background = '#f4f6fa';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fff';
              }}
            >
              <Download size={13} />
              {bulkDownloading ? 'Indiriliyor...' : 'Secilileri Indir (zip)'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: INK_MUTE }}>{pagination.total} fatura</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => loadDocuments(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  style={{
                    background: '#fff',
                    border: `1px solid #d8e0ec`,
                    borderRadius: 8,
                    width: 34,
                    height: 34,
                    color: INK_SOFT,
                    cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pagination.page <= 1 ? 0.4 : 1,
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize: 12, color: INK_SOFT, fontWeight: 500 }}>
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => loadDocuments(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  style={{
                    background: '#fff',
                    border: `1px solid #d8e0ec`,
                    borderRadius: 8,
                    width: 34,
                    height: 34,
                    color: INK_SOFT,
                    cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pagination.page >= pagination.totalPages ? 0.4 : 1,
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CariSelectModal
        isOpen={cariModalOpen}
        onClose={() => setCariModalOpen(false)}
        onSelect={(cari) => setSelectedCari(cari)}
        cariList={cariList}
      />
    </>
  );
}
