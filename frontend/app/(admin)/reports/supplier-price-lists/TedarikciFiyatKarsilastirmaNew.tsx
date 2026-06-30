'use client';

import Link from 'next/link';
import {
  ChevronRight,
  Download,
  RefreshCw,
  Upload,
  FileText,
  FileSpreadsheet,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import {
  useTedarikciFiyatKarsilastirma,
  STATUS_TABS,
  formatPercent,
  type ExcelColumnRole,
  type PdfColumnRole,
} from './useTedarikciFiyatKarsilastirma';
import ApplyCostModal from './ApplyCostModal';

/**
 * Yeni gorunum: Tedarikci Fiyat Karsilastirma raporu.
 * Tum mantik useTedarikciFiyatKarsilastirma hook'undan gelir; hicbir
 * handler/kolon/filtre/ozet/sekme/satir/onizleme-rol-secimi/drill (gecmis
 * yukleme secimi) / Excel export dusurulmemistir.
 *
 * Tasarim referansi: design HTML #scr-genrep (data-screen-label="Rapor") genel
 * rapor stili + brief 4.9.3. Beyaz kart #fff / border #e7ebf2 / radius 12px;
 * tablo basligi bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac;
 * fark% renk esigi (>=20 kirmizi-buyuk-artis / >=10 amber / <10 yesil mantigi
 * brief'e gore "fark" oldugu icin: artis ne kadar buyukse o kadar dikkat ->
 * mutlak deger esigi >=20 kirmizi / >=10 amber / <10 yesil).
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
const AMBER = '#b45309';
const RED = '#b91c1c';

// Fark % renk esigi: mutlak fark buyudukce dikkat artar.
// >=20 kirmizi (buyuk degisim) / >=10 amber / <10 yesil
const farkColor = (m: number) => {
  const a = Math.abs(m);
  return a >= 20 ? RED : a >= 10 ? AMBER : EMERALD;
};

// Baslik satiri dropdown'unda satir hucrelerini kisa ozetle (ilk dolu hucreler)
const summarizeRow = (cells: string[]) => {
  const parts = cells.map((c) => (c || '').trim()).filter(Boolean);
  if (!parts.length) return '(bos satir)';
  const joined = parts.join(' | ');
  return joined.length > 90 ? `${joined.slice(0, 90)}...` : joined;
};

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

const fieldStyle: React.CSSProperties = {
  height: 38,
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

const sectionTitle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  color: INK,
};

const subTitle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: INK,
};

const hint: React.CSSProperties = {
  fontSize: 11.5,
  color: FAINT,
};

const cellRight: React.CSSProperties = { textAlign: 'right' };

// Kucuk inline tablo (onizleme) basligi/hucresi
const miniHead: React.CSSProperties = {
  padding: '9px 12px',
  background: TABLE_HEAD_BG,
  borderBottom: `1px solid ${SOFT_LINE}`,
  fontSize: 10,
  fontWeight: 600,
  color: FAINT,
  textTransform: 'uppercase',
  letterSpacing: '.03em',
};

const miniCell: React.CSSProperties = {
  padding: '9px 12px',
  fontSize: 11.5,
  color: INK,
  borderTop: `1px solid ${ROW_LINE}`,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const roleSelect: React.CSSProperties = {
  height: 32,
  width: '100%',
  border: `1px solid ${FIELD_LINE}`,
  borderRadius: 7,
  padding: '0 8px',
  fontSize: 11.5,
  color: INK,
  fontFamily: 'inherit',
  outline: 'none',
  cursor: 'pointer',
  background: '#fff',
};

export default function TedarikciFiyatKarsilastirmaNew() {
  const {
    suppliers,
    uploads,
    selectedSupplierId,
    selectedFiles,
    preview,
    previewLoading,
    showAdvanced,
    setShowAdvanced,
    mapping,
    setMapping,
    activeUploadId,
    setActiveUploadId,
    activeUpload,
    activeStatus,
    setActiveStatus,
    items,
    pagination,
    loading,
    uploading,
    itemsLoading,
    applyModalOpen,
    applyPreviewLoading,
    applyPreview,
    applyConfirmed,
    setApplyConfirmed,
    applying,
    applyProgress,
    handleApplyPreviewOpen,
    handleApplyConfirm,
    closeApplyModal,
    excelColumns,
    excelRawRows,
    excelMatchPreview,
    pdfColumns,
    pdfPreviewRows,
    columnCount,
    canPreview,
    uploadDisabled,
    pageSummary,
    parsePreviewNumber,
    getExcelRoleForColumn,
    handleExcelColumnRoleChange,
    getExcelColumnIndexForRole,
    handleExcelRoleSelect,
    handleExcelHeaderRowChange,
    getPdfRoleForColumn,
    handlePdfColumnRoleChange,
    loadUploads,
    loadItems,
    handleSupplierChange,
    handleFileChange,
    handlePreview,
    handleUpload,
    handleDownload,
  } = useTedarikciFiyatKarsilastirma();

  // matched: 10 kolon, multiple/suspicious: 5, unmatched: 4
  const isMatched = activeStatus === 'matched';
  const hasMatchedExtras = isMatched;
  const matchedColsGrid =
    '1fr 1.6fr 1fr 1fr 1fr 1.6fr 1fr 1fr 0.9fr 0.8fr';
  const baseColsGrid = '1.2fr 2fr 1fr 1fr 2fr';

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
        <span style={{ color: MUTED, fontWeight: 500 }}>Tedarikci Fiyat Listeleri</span>
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
            }}
          >
            Tedarikci Fiyat Karsilastirma
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Excel veya PDF listelerini yukleyip eslesmeleri hizli goruntuleyin.
          </div>
        </div>

        <button
          type="button"
          onClick={loadUploads}
          disabled={loading}
          style={{ ...headBtn, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          <RefreshCw size={15} strokeWidth={2} className={loading ? 'animate-spin' : undefined} />
          Yenile
        </button>
      </div>

      {/* === Yeni Liste Yukle === */}
      <div style={{ ...cardStyle, padding: 18, marginBottom: 18 }}>
        <div style={sectionTitle}>Yeni Liste Yukle</div>
        <div style={{ ...hint, marginTop: 4, marginBottom: 14 }}>
          Tedarikci secip dosyayi yukleyin (Excel veya PDF).
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1.2fr',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div>
            <label style={labelStyle}>Tedarikci</label>
            <select
              value={selectedSupplierId}
              onChange={handleSupplierChange}
              style={{ ...fieldStyle, cursor: 'pointer' }}
            >
              <option value="">Tedarikci secin</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Dosyalar</label>
            <input
              type="file"
              multiple
              accept=".pdf,.xls,.xlsx"
              onChange={handleFileChange}
              style={{ ...fieldStyle, padding: '7px 10px', height: 38 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => handlePreview()}
              disabled={!canPreview}
              style={{
                ...headBtn,
                flex: 1,
                justifyContent: 'center',
                opacity: !canPreview ? 0.5 : 1,
                cursor: !canPreview ? 'not-allowed' : 'pointer',
              }}
            >
              {previewLoading ? (
                <RefreshCw size={15} strokeWidth={2} className="animate-spin" />
              ) : (
                <FileText size={15} strokeWidth={2} />
              )}
              {preview ? 'Onizlemeyi Guncelle' : 'Onizleme Al'}
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploadDisabled}
              style={{
                ...primaryBtn,
                flex: 1,
                justifyContent: 'center',
                opacity: uploadDisabled ? 0.5 : 1,
                cursor: uploadDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? (
                <RefreshCw size={15} strokeWidth={2} className="animate-spin" />
              ) : (
                <Upload size={15} strokeWidth={2} />
              )}
              Yukle
            </button>
          </div>
        </div>

        {selectedFiles.length > 0 && (
          <div style={{ ...hint, marginTop: 12 }}>{selectedFiles.length} dosya secildi.</div>
        )}

        {!preview && selectedFiles.length > 0 && (
          <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>
            Yukleme icin once onizleme alin.
          </div>
        )}

        {preview && (
          <div
            style={{
              border: `1px solid ${SOFT_LINE}`,
              background: '#fafbfd',
              borderRadius: 12,
              padding: 16,
              marginTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
            }}
          >
            <div style={subTitle}>Onizleme</div>

            {/* === Excel Onizleme === */}
            {preview.excel && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <FileSpreadsheet size={15} strokeWidth={2} style={{ color: EMERALD }} />
                  <span style={subTitle}>Excel Onizleme</span>
                </div>

                {/* 1) Sheet + Baslik satiri secimi (birinci sinif) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Sheet</label>
                    <select
                      value={mapping.excelSheetName}
                      onChange={(event) =>
                        setMapping((prev) => ({ ...prev, excelSheetName: event.target.value }))
                      }
                      style={{ ...fieldStyle, cursor: 'pointer' }}
                    >
                      <option value="">Sheet secin</option>
                      {preview.excel.sheetNames.map((sheet) => (
                        <option key={sheet} value={sheet}>{sheet}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Baslik Satiri (dogru basliklarin oldugu satir)</label>
                    <select
                      value={mapping.excelHeaderRow || (preview.excel.headerRow ? String(preview.excel.headerRow) : '')}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next) && next > 0) handleExcelHeaderRowChange(next);
                      }}
                      style={{ ...fieldStyle, cursor: 'pointer' }}
                    >
                      {excelRawRows.length ? (
                        excelRawRows.map((cells, index) => (
                          <option key={`hdr-${index}`} value={index + 1}>
                            {`Satir ${index + 1}: ${summarizeRow(cells)}`}
                          </option>
                        ))
                      ) : (
                        <option value={preview.excel.headerRow || 1}>
                          {`Satir ${preview.excel.headerRow || 1}`}
                        </option>
                      )}
                    </select>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: FAINT, marginTop: -6 }}>
                  Basliklar yanlis satirdaysa dogru satiri secin; kolonlar otomatik yenilenir.
                </div>

                {/* 2) Rol -> kolon secimi (birinci sinif, 3 dropdown) */}
                <div style={{ ...cardStyle, padding: 14 }}>
                  <div style={{ ...subTitle, marginBottom: 4 }}>Kolon Eslestirme</div>
                  <div style={{ fontSize: 11, color: FAINT, marginBottom: 12 }}>
                    Her rol icin dogru kolonu secin. Ornek degerler hangi kolon oldugunu gosterir.
                    Maliyet (fiyat) kolonu zorunludur.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    {([
                      { role: 'code' as const, label: 'Urun Kodu', required: true },
                      { role: 'name' as const, label: 'Urun Adi (opsiyonel)', required: false },
                      { role: 'price' as const, label: 'Maliyet (Fiyat)', required: true },
                    ]).map(({ role, label }) => {
                      const selectedIndex = getExcelColumnIndexForRole(role);
                      return (
                        <div key={`role-${role}`}>
                          <label style={labelStyle}>{label}</label>
                          <select
                            value={selectedIndex >= 0 ? String(selectedIndex) : ''}
                            onChange={(event) =>
                              handleExcelRoleSelect(
                                role,
                                event.target.value === '' ? null : Number(event.target.value),
                              )
                            }
                            style={{ ...fieldStyle, height: 36, cursor: 'pointer' }}
                          >
                            <option value="">Secilmedi</option>
                            {excelColumns.map((column) => {
                              const sample = column.samples?.[0];
                              return (
                                <option key={`${role}-opt-${column.index}`} value={column.index}>
                                  {column.label}
                                  {sample ? ` — ${sample.length > 28 ? `${sample.slice(0, 28)}...` : sample}` : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3) Kolon listesi (tum kolonlar + ornek + rol) — ikincil/detayli */}
                <div style={{ ...cardStyle, overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1.6fr 150px',
                      gap: 10,
                      ...miniHead,
                    }}
                  >
                    <span>Kolon</span>
                    <span>Ornek Degerler</span>
                    <span>Rol</span>
                  </div>
                  {excelColumns.length ? (
                    excelColumns.map((column) => (
                      <div
                        key={`excel-col-${column.index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1.6fr 150px',
                          gap: 10,
                          alignItems: 'center',
                          padding: '8px 12px',
                          borderTop: `1px solid ${ROW_LINE}`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11.5,
                            color: INK,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={column.label}
                        >
                          {column.label}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: MUTED,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={column.samples?.join(' | ')}
                        >
                          {column.samples?.length ? column.samples.join(' | ') : '-'}
                        </span>
                        <select
                          value={getExcelRoleForColumn(column.index)}
                          onChange={(event) =>
                            handleExcelColumnRoleChange(column.index, event.target.value as ExcelColumnRole)
                          }
                          style={roleSelect}
                        >
                          <option value="">Yoksay</option>
                          <option value="code">Urun Kodu</option>
                          <option value="name">Urun Adi</option>
                          <option value="price">Maliyet</option>
                        </select>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '14px 12px', textAlign: 'center', ...hint }}>
                      Kolon bulunamadi.
                    </div>
                  )}
                </div>

                {/* 4) Eslesen onizleme (secime gore canli guncellenir) */}
                <div style={{ ...cardStyle, overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 2fr 1fr',
                      gap: 10,
                      ...miniHead,
                    }}
                  >
                    <span>Kod</span>
                    <span>Ad</span>
                    <span style={cellRight}>Maliyet</span>
                  </div>
                  {excelMatchPreview.length ? (
                    excelMatchPreview.map((sample, index) => (
                      <div
                        key={`excel-sample-${index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 2fr 1fr',
                          gap: 10,
                          alignItems: 'center',
                          ...miniCell,
                        }}
                      >
                        <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: MUTED }}>
                          {sample.code ?? '-'}
                        </span>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {sample.name ?? '-'}
                        </span>
                        <span style={{ ...cellRight, fontWeight: 600 }}>
                          {typeof sample.price === 'number' ? formatCurrency(sample.price) : '-'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '14px 12px', textAlign: 'center', ...hint }}>
                      Kod ve maliyet kolonlarini secin.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* === PDF Onizleme === */}
            {preview.pdf && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <FileText size={15} strokeWidth={2} style={{ color: RED }} />
                  <span style={subTitle}>PDF Onizleme</span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <div style={hint}>Kolonlari tiplerine gore eslestirin.</div>
                  <div style={hint}>Kod / Ad / Fiyat secimi gerekli.</div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                    style={{ ...headBtn, height: 34, width: '100%', justifyContent: 'center' }}
                  >
                    {showAdvanced ? 'Gelismisi Gizle' : 'Gelismis Ayarlar'}
                  </button>
                </div>

                {showAdvanced && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Kod Filtresi (teknik)</label>
                      <input
                        value={mapping.pdfCodePattern}
                        onChange={(event) =>
                          setMapping((prev) => ({ ...prev, pdfCodePattern: event.target.value }))
                        }
                        placeholder="Orn: [A-Z]{2}\\d+"
                        style={{ ...fieldStyle, fontFamily: "'Roboto Mono', monospace" }}
                      />
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 11, color: FAINT }}>
                  Kolon tiplerini degistirirseniz onizlemeyi guncelleyin.
                </div>

                {/* Kolon -> Ornek -> Tip */}
                <div style={{ ...cardStyle, overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 2fr 170px',
                      gap: 10,
                      ...miniHead,
                    }}
                  >
                    <span>Kolon</span>
                    <span>Ornek Degerler</span>
                    <span>Tip</span>
                  </div>
                  {pdfColumns.length ? (
                    pdfColumns.map((column) => (
                      <div
                        key={`pdf-col-${column.index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 2fr 170px',
                          gap: 10,
                          alignItems: 'center',
                          padding: '8px 12px',
                          borderTop: `1px solid ${ROW_LINE}`,
                        }}
                      >
                        <span style={{ fontSize: 11.5, color: INK }}>Kolon {column.index + 1}</span>
                        <span
                          style={{
                            fontSize: 11.5,
                            color: MUTED,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {column.samples.length ? column.samples.join(' | ') : '-'}
                        </span>
                        <select
                          value={getPdfRoleForColumn(column.index)}
                          onChange={(event) =>
                            handlePdfColumnRoleChange(column.index, event.target.value as PdfColumnRole)
                          }
                          style={roleSelect}
                        >
                          <option value="">Yoksay</option>
                          <option value="code">Urun Kodu</option>
                          <option value="name">Urun Adi</option>
                          <option value="price">Fiyat</option>
                        </select>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '14px 12px', textAlign: 'center', ...hint }}>
                      Sayisal kolon bulunamadi.
                    </div>
                  )}
                </div>

                {/* Ornek satirlar */}
                <div style={{ ...cardStyle, overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 2fr 1fr',
                      gap: 10,
                      ...miniHead,
                    }}
                  >
                    <span>Kod</span>
                    <span>Urun Adi</span>
                    <span style={cellRight}>Fiyat</span>
                  </div>
                  {pdfPreviewRows.length ? (
                    pdfPreviewRows.map((row, index) => {
                      const parsedPrice = parsePreviewNumber(row.price);
                      return (
                        <div
                          key={`pdf-sample-${index}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 2fr 1fr',
                            gap: 10,
                            alignItems: 'center',
                            ...miniCell,
                          }}
                        >
                          <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: MUTED }}>
                            {row.code || '-'}
                          </span>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.name || '-'}
                          </span>
                          <span style={{ ...cellRight, fontWeight: 600 }}>
                            {parsedPrice !== null ? formatCurrency(parsedPrice) : row.price || '-'}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '14px 12px', textAlign: 'center', ...hint }}>
                      Ornek bulunamadi.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* === Gecmis Yuklemeler (sol) + Rapor Detayi (sag) === */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 1fr) 2fr',
          gap: 18,
          marginBottom: 18,
        }}
      >
        {/* Gecmis Yuklemeler */}
        <div style={{ ...cardStyle, padding: 16 }}>
          <div style={sectionTitle}>Gecmis Yuklemeler</div>
          <div style={{ ...hint, marginTop: 4, marginBottom: 12 }}>Son yuklenen raporlar.</div>

          {loading ? (
            <div style={{ padding: '32px 0', textAlign: 'center', ...hint }}>Yukleniyor...</div>
          ) : uploads.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', ...hint }}>Kayit bulunamadi.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {uploads.map((upload) => {
                const active = upload.id === activeUploadId;
                return (
                  <button
                    key={upload.id}
                    type="button"
                    onClick={() => setActiveUploadId(upload.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: `1px solid ${active ? PRIMARY : LINE}`,
                      background: active ? '#eef2fa' : '#fff',
                      borderRadius: 10,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: active ? PRIMARY : INK,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {upload.supplier?.name || 'Tedarikci'}
                      </span>
                      <span style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap' }}>
                        {formatDateShort(upload.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>
                      {upload.totalItems} satir | Eslesen {upload.matchedItems} | Esmeyen{' '}
                      {upload.unmatchedItems}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Rapor Detayi */}
        <div style={{ ...cardStyle, padding: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              marginBottom: 14,
            }}
          >
            <div>
              <div style={sectionTitle}>Rapor Detayi</div>
              <div style={{ ...hint, marginTop: 4 }}>
                {activeUpload
                  ? `Secili rapor: ${activeUpload.supplier?.name || '-'}`
                  : 'Rapor secin'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!activeUploadId}
              style={{
                ...headBtn,
                opacity: !activeUploadId ? 0.5 : 1,
                cursor: !activeUploadId ? 'not-allowed' : 'pointer',
              }}
            >
              <Download size={15} strokeWidth={2} />
              Excel Indir
            </button>
          </div>

          {/* 4 ozet kart */}
          {pageSummary && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 14,
              }}
            >
              {pageSummary.map((item) => (
                <div
                  key={item.label}
                  style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '12px 13px' }}
                >
                  <div style={{ fontSize: 11, color: FAINT }}>{item.label}</div>
                  <div style={{ fontSize: 19, fontWeight: 600, color: INK, marginTop: 4 }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sekmeler + (matched) toplu uygula butonu */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
              marginBottom: 14,
            }}
          >
            {STATUS_TABS.map((tab) => {
              const active = activeStatus === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveStatus(tab.key)}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 8,
                    border: `1px solid ${active ? PRIMARY : LINE}`,
                    background: active ? PRIMARY : '#fff',
                    color: active ? '#fff' : MUTED,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}

            {isMatched && activeUpload && activeUpload.matchedItems > 0 && (
              <button
                type="button"
                onClick={handleApplyPreviewOpen}
                disabled={applyPreviewLoading || applying}
                style={{
                  marginLeft: 'auto',
                  height: 32,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: EMERALD,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  opacity: applyPreviewLoading || applying ? 0.6 : 1,
                  cursor: applyPreviewLoading || applying ? 'not-allowed' : 'pointer',
                }}
              >
                {applyPreviewLoading ? (
                  <RefreshCw size={14} strokeWidth={2} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} strokeWidth={2} />
                )}
                Maliyetleri Mikro'ya Uygula (toplu)
              </button>
            )}
          </div>

          {/* Tablo */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: hasMatchedExtras ? 1080 : 720 }}>
                {/* Header row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: hasMatchedExtras ? matchedColsGrid : baseColsGrid,
                    gap: 10,
                    padding: '11px 14px',
                    background: TABLE_HEAD_BG,
                    borderBottom: `1px solid ${SOFT_LINE}`,
                    fontSize: 10,
                    fontWeight: 600,
                    color: FAINT,
                    textTransform: 'uppercase',
                    letterSpacing: '.03em',
                    alignItems: 'center',
                  }}
                >
                  <span>Tedarikci Kod</span>
                  <span>Urun Adi</span>
                  <span style={cellRight}>Liste Fiyat</span>
                  <span style={cellRight}>Net Fiyat</span>
                  {isMatched && (
                    <>
                      <span>Urun Kodu</span>
                      <span>Urun Adi (B2B)</span>
                      <span style={cellRight}>Guncel Maliyet</span>
                      <span style={cellRight}>Yeni Maliyet</span>
                      <span style={cellRight}>Fark</span>
                      <span style={cellRight}>Fark %</span>
                    </>
                  )}
                  {activeStatus === 'multiple' && <span>Eslesen Urunler</span>}
                  {activeStatus === 'suspicious' && <span>Eslesen Urunler</span>}
                </div>

                {/* Rows */}
                {itemsLoading ? (
                  <div style={{ padding: '40px 14px', textAlign: 'center' }}>
                    <RefreshCw
                      size={26}
                      strokeWidth={2}
                      className="animate-spin"
                      style={{ margin: '0 auto 10px', color: FAINT, display: 'block' }}
                    />
                    <span style={hint}>Yukleniyor...</span>
                  </div>
                ) : items.length === 0 ? (
                  <div style={{ padding: '40px 14px', textAlign: 'center' }}>
                    <FileText
                      size={26}
                      strokeWidth={2}
                      style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }}
                    />
                    <span style={hint}>Kayit yok.</span>
                  </div>
                ) : (
                  items.map((row, index) => (
                    <div
                      key={`${row.supplierCode}-${index}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: hasMatchedExtras ? matchedColsGrid : baseColsGrid,
                        gap: 10,
                        padding: '11px 14px',
                        borderTop: `1px solid ${ROW_LINE}`,
                        fontSize: 11.5,
                        color: INK,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: MUTED }}>
                        {row.supplierCode}
                      </span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.supplierName || '-'}>
                        {row.supplierName || '-'}
                      </span>
                      <span style={cellRight}>
                        {typeof row.sourcePrice === 'number' ? formatCurrency(row.sourcePrice) : '-'}
                      </span>
                      <span style={{ ...cellRight, fontWeight: 600 }}>
                        {typeof row.netPrice === 'number' ? formatCurrency(row.netPrice) : '-'}
                      </span>
                      {isMatched && (
                        <>
                          <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: MUTED }}>
                            {row.productCode}
                          </span>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.productName}>
                            {row.productName}
                          </span>
                          <span style={{ ...cellRight, color: MUTED }}>
                            {typeof row.currentCost === 'number' ? formatCurrency(row.currentCost) : '-'}
                          </span>
                          <span style={{ ...cellRight, fontWeight: 600 }}>
                            {typeof row.newCost === 'number' ? formatCurrency(row.newCost) : '-'}
                          </span>
                          <span
                            style={{
                              ...cellRight,
                              fontWeight: 600,
                              color:
                                typeof row.costDifference === 'number'
                                  ? farkColor(row.costDifference)
                                  : INK,
                            }}
                          >
                            {typeof row.costDifference === 'number' ? formatCurrency(row.costDifference) : '-'}
                          </span>
                          <span
                            style={{
                              ...cellRight,
                              fontWeight: 700,
                              color:
                                typeof row.percentDifference === 'number'
                                  ? farkColor(row.percentDifference)
                                  : INK,
                            }}
                          >
                            {typeof row.percentDifference === 'number'
                              ? formatPercent(row.percentDifference)
                              : '-'}
                          </span>
                        </>
                      )}
                      {activeStatus === 'multiple' && (
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: MUTED }}>
                          {Array.isArray(row.matchedProductCodes) ? row.matchedProductCodes.join(', ') : '-'}
                        </span>
                      )}
                      {activeStatus === 'suspicious' && (
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: MUTED }}>
                          {Array.isArray(row.matchedProductCodes) ? row.matchedProductCodes.join(', ') : '-'}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Sayfalama */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderTop: `1px solid ${SOFT_LINE}`,
              }}
            >
              <span style={hint}>Toplam {pagination.total} kayit</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  disabled={pagination.page <= 1 || itemsLoading}
                  onClick={() =>
                    activeUploadId && loadItems(activeUploadId, activeStatus, pagination.page - 1)
                  }
                  style={{
                    ...headBtn,
                    height: 32,
                    padding: '0 12px',
                    opacity: pagination.page <= 1 || itemsLoading ? 0.5 : 1,
                    cursor: pagination.page <= 1 || itemsLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Onceki
                </button>
                <span style={hint}>
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages || itemsLoading}
                  onClick={() =>
                    activeUploadId && loadItems(activeUploadId, activeStatus, pagination.page + 1)
                  }
                  style={{
                    ...headBtn,
                    height: 32,
                    padding: '0 12px',
                    opacity: pagination.page >= pagination.totalPages || itemsLoading ? 0.5 : 1,
                    cursor:
                      pagination.page >= pagination.totalPages || itemsLoading
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  Sonraki
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* === Notlar === */}
      <div style={{ ...cardStyle, padding: 16 }}>
        <div style={sectionTitle}>Notlar</div>
        <div style={{ ...hint, marginTop: 4, marginBottom: 12 }}>
          Iskonto ayarlari ve dosya eslestirme bilgilerini kontrol etmeyi unutmayin.
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            color: MUTED,
          }}
        >
          <Info size={15} strokeWidth={2} style={{ color: FAINT, flex: 'none' }} />
          Eslesmeyen ve coklu eslesen urunler ayri listelenir. Iskonto ayarlarini tedarikci
          ekranindan guncelleyebilirsiniz.
        </div>
      </div>

      <ApplyCostModal
        open={applyModalOpen}
        loading={applyPreviewLoading}
        data={applyPreview}
        confirmed={applyConfirmed}
        setConfirmed={setApplyConfirmed}
        applying={applying}
        applyProgress={applyProgress}
        onClose={closeApplyModal}
        onConfirm={handleApplyConfirm}
      />
    </div>
  );
}
