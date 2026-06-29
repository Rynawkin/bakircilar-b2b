'use client';

import Link from 'next/link';
import {
  ChevronRight,
  Download,
  FolderCog,
  RefreshCw,
  Search,
  X,
  AlertTriangle,
  CheckCircle2,
  CalendarOff,
  Layers,
} from 'lucide-react';
import {
  useFiyatAilesiMaliyet,
  DETAIL_COLUMN_KEYS,
  formatCurrency,
  formatDate,
  getVatPercent,
  computeCostT,
  issueLabel,
  formatInputNumber,
  type DetailColumnKey,
  type FamilyStatus,
} from './useFiyatAilesiMaliyet';

/**
 * Yeni gorunum: Fiyat Ailesi Maliyet Kontrolu raporu.
 * Tum mantik useFiyatAilesiMaliyet hook'undan gelir; hicbir handler/kolon/filtre/
 * ozet/satir-aksiyon/modal/resize/audit-log/yazma (updateProductCost,
 * updateDirtyCosts, saveDetailColumnWidths...) dusurulmemistir.
 *
 * Tasarim referansi: design HTML genel rapor stili (#scr-fam / #scr-genrep) +
 * brief 4.12.5. Beyaz kart #fff / border #e7ebf2 / radius 12px; tablo basligi
 * bg #fafbfd; primary #15356b; ink #14223b/#51607a/#8b97ac; emerald/amber/red.
 * Tasarimda bu ekrana ait birebir mockup yok; genel rapor stili + brief
 * checklist'i ile mevcut ekranin TUM oge/kolon/kart/filtre/satir-aksiyonlari
 * cizildi. Klasikte olmayan oge UYDURULMADI.
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
  border: `1px solid ${LINE}`,
  borderRadius: 9,
  background: '#fff',
  color: INK,
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
};

const smallBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 30,
  padding: '0 11px',
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  background: '#fff',
  color: INK,
  fontSize: 11.5,
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

const cellRight: React.CSSProperties = { textAlign: 'right' };
const cellCenter: React.CSSProperties = { textAlign: 'center' };

const statusBadge = (kind: 'problem' | 'ok'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  background: kind === 'problem' ? '#fde8e8' : '#dcf5ea',
  color: kind === 'problem' ? RED : EMERALD,
});

const issueBadge = (issueType: 'ok' | 'outdated' | 'missing-date'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  background:
    issueType === 'ok' ? '#dcf5ea' : issueType === 'missing-date' ? '#fde8e8' : '#fdf0dc',
  color: issueType === 'ok' ? EMERALD : issueType === 'missing-date' ? RED : AMBER,
});

const dateChip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 9px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 500,
  background: '#f1f4f9',
  color: MUTED,
};

const numInput: React.CSSProperties = {
  width: 88,
  height: 30,
  border: `1px solid #e3e8f0`,
  borderRadius: 7,
  padding: '0 8px',
  fontSize: 11.5,
  color: INK,
  textAlign: 'right',
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
};

// Families tablo grid: Aile | Durum | Stok | Sorunlu | Tarih Dagilimi | En Eski/En Yeni | Islem
const FAMILY_GRID = '2.2fr 110px 70px 90px 2.4fr 1.6fr 130px';

export default function FiyatAilesiMaliyetNew() {
  const {
    data,
    loading,
    status,
    setStatus,
    search,
    setSearch,
    includeInactive,
    setIncludeInactive,
    setSelectedFamilyId,
    detailSearch,
    setDetailSearch,
    onlyIssues,
    setOnlyIssues,
    costPInputByCode,
    setCostPInputByCode,
    costTInputByCode,
    setCostTInputByCode,
    setManualCostTByCode,
    manualCostTByCode,
    updatePriceListsByCode,
    setUpdatePriceListsByCode,
    updatingCostByCode,
    bulkUpdating,
    detailColumnWidths,
    families,
    selectedFamily,
    detailTableWidth,
    filteredDetailItems,
    loadReport,
    markCostDirty,
    applyCurrentCostToInputs,
    updateProductCost,
    updateDirtyCosts,
    startColumnResize,
    saveDetailColumnWidths,
    resetDetailColumnWidths,
    exportToExcel,
  } = useFiyatAilesiMaliyet();

  const summary = data?.summary;

  const renderResizableHeader = (
    key: DetailColumnKey,
    label: string,
    align: 'left' | 'center' | 'right' = 'left'
  ) => (
    <th
      style={{
        position: 'relative',
        padding: '9px 12px',
        textAlign: align,
        fontSize: 10,
        fontWeight: 700,
        color: FAINT,
        textTransform: 'uppercase',
        letterSpacing: '.02em',
        background: TABLE_HEAD_BG,
        borderBottom: `1px solid ${SOFT_LINE}`,
        whiteSpace: 'nowrap',
      }}
    >
      <span>{label}</span>
      <span
        role="separator"
        aria-label={`${label} kolon genisligi`}
        onMouseDown={(event) => startColumnResize(event, key)}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          height: '100%',
          width: 4,
          cursor: 'col-resize',
          background: 'transparent',
        }}
      />
    </th>
  );

  return (
    <div style={{ maxWidth: 1800, margin: '0 auto', padding: 24 }}>
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
        <span style={{ color: MUTED, fontWeight: 500 }}>Fiyat Ailesi Maliyet Kontrolu</span>
      </div>

      {/* Header */}
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
            Fiyat Ailesi Maliyet Kontrolu
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Ayni fiyat ailesindeki stoklarin guncel maliyet tarihlerini gun bazinda karsilastirir.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/reports/price-families" style={headBtn}>
            <FolderCog size={15} strokeWidth={2} />
            Fiyat Aileleri
          </Link>
          <button
            type="button"
            onClick={exportToExcel}
            disabled={!families.length}
            style={{
              ...headBtn,
              opacity: families.length ? 1 : 0.5,
              cursor: families.length ? 'pointer' : 'not-allowed',
            }}
          >
            <Download size={15} strokeWidth={2} />
            Excel
          </button>
          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            style={{
              ...headBtn,
              background: PRIMARY,
              color: '#fff',
              border: 'none',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={15} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>
      </div>

      {/* Summary cards (4 metrik) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div style={{ ...cardStyle, padding: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: FAINT }}>
            <AlertTriangle size={13} strokeWidth={2} style={{ color: RED }} />
            Sorunlu aile
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: RED, marginTop: 5 }}>
            {summary?.problemFamilies ?? 0}
          </div>
        </div>
        <div style={{ ...cardStyle, padding: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: FAINT }}>
            <CheckCircle2 size={13} strokeWidth={2} style={{ color: EMERALD }} />
            Kapali aile
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: EMERALD, marginTop: 5 }}>
            {summary?.okFamilies ?? 0}
          </div>
        </div>
        <div style={{ ...cardStyle, padding: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: FAINT }}>
            <AlertTriangle size={13} strokeWidth={2} style={{ color: AMBER }} />
            Eski/eksik stok
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: AMBER, marginTop: 5 }}>
            {summary?.outdatedProductCount ?? 0}
          </div>
        </div>
        <div style={{ ...cardStyle, padding: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: FAINT }}>
            <CalendarOff size={13} strokeWidth={2} style={{ color: MUTED }} />
            Tarih yok
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: INK, marginTop: 5 }}>
            {summary?.missingCostDateCount ?? 0}
          </div>
        </div>
      </div>

      {/* Rapor Mantigi + Filtreler */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Rapor Mantigi</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4, marginBottom: 14, lineHeight: 1.5 }}>
          Aile icindeki en yeni maliyet tarihi hedef tarih kabul edilir. Tarihi bos olan veya hedef
          tarihten eski kalan stoklar sorunlu sayilir.
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.4fr) auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
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
              placeholder="Aile, stok kodu veya stok adi ara..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ ...inputStyle, paddingLeft: 32 }}
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as FamilyStatus)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="problem">Sadece sorunlular</option>
            <option value="all">Tum aileler</option>
            <option value="ok">Kapali aileler</option>
          </select>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 36,
              padding: '0 12px',
              border: `1px solid #e3e8f0`,
              borderRadius: 8,
              background: '#fff',
              fontSize: 12.5,
              color: INK,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
            />
            Pasif aileleri dahil et
          </label>
          <div style={{ fontSize: 12.5, color: FAINT, textAlign: 'right', whiteSpace: 'nowrap' }}>
            {loading ? 'Yukleniyor...' : `${families.length} aile listeleniyor`}
          </div>
        </div>
      </div>

      {/* Aileler tablosu */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${SOFT_LINE}` }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Aileler</div>
          <div style={{ fontSize: 12, color: FAINT, marginTop: 2 }}>
            Detay acarak stok bazinda maliyet ve 10 fiyat listesini guncelleyebilirsiniz.
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1080 }}>
            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: FAMILY_GRID,
                gap: 10,
                padding: '11px 16px',
                background: TABLE_HEAD_BG,
                borderBottom: `1px solid ${SOFT_LINE}`,
                fontSize: 10,
                fontWeight: 700,
                color: FAINT,
                textTransform: 'uppercase',
                letterSpacing: '.02em',
                alignItems: 'center',
              }}
            >
              <span>Aile</span>
              <span style={cellCenter}>Durum</span>
              <span style={cellRight}>Stok</span>
              <span style={cellRight}>Sorunlu</span>
              <span>Tarih Dagilimi</span>
              <span>En Eski / En Yeni</span>
              <span style={cellRight}>Islem</span>
            </div>

            {/* Rows */}
            {loading ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <RefreshCw
                  size={30}
                  strokeWidth={2}
                  className="animate-spin"
                  style={{ margin: '0 auto 12px', color: FAINT, display: 'block' }}
                />
                <p style={{ color: MUTED, margin: 0 }}>Rapor yukleniyor...</p>
              </div>
            ) : families.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <Layers
                  size={30}
                  strokeWidth={2}
                  style={{ margin: '0 auto 8px', color: FAINT, display: 'block' }}
                />
                <p style={{ color: MUTED, margin: 0 }}>Kriterlere uygun fiyat ailesi bulunamadi.</p>
              </div>
            ) : (
              families.map((family) => (
                <div
                  key={family.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: FAMILY_GRID,
                    gap: 10,
                    padding: '12px 16px',
                    borderTop: `1px solid ${ROW_LINE}`,
                    fontSize: 12,
                    color: INK,
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: INK }}>{family.name}</div>
                    <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>
                      {family.code || '-'}
                      {family.active ? '' : ' / pasif'}
                    </div>
                    {family.note && (
                      <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{family.note}</div>
                    )}
                  </div>
                  <div style={cellCenter}>
                    <span style={statusBadge(family.status)}>
                      {family.status === 'problem' ? 'Sorunlu' : 'Kapali'}
                    </span>
                  </div>
                  <div style={cellRight}>{family.itemCount}</div>
                  <div style={{ ...cellRight, fontWeight: 700, color: AMBER }}>{family.outdatedCount}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {family.dateGroups.map((group) => (
                      <span key={group.date || 'missing'} style={dateChip}>
                        {formatDate(group.date)}: {group.count}
                      </span>
                    ))}
                  </div>
                  <div style={{ color: MUTED }}>
                    {formatDate(family.oldestCostDate)} / {formatDate(family.latestCostDate)}
                  </div>
                  <div style={cellRight}>
                    <button
                      type="button"
                      onClick={() => setSelectedFamilyId(family.id)}
                      style={smallBtn}
                    >
                      Aile detayi ac
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Aile Detayi modal */}
      {selectedFamily && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            overflowY: 'auto',
            background: 'rgba(10, 22, 44, 0.45)',
            padding: 16,
          }}
        >
          <div
            style={{
              marginTop: 32,
              width: '100%',
              maxWidth: 1600,
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 24px 60px rgba(15, 32, 64, 0.28)',
              overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: 16,
                borderBottom: `1px solid ${SOFT_LINE}`,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, color: INK }}>
                  {selectedFamily.name}
                </h2>
                <p style={{ fontSize: 12.5, color: MUTED, margin: '5px 0 0' }}>
                  Hedef tarih: {formatDate(selectedFamily.latestCostDate)} - sorunlu stok:{' '}
                  {selectedFamily.outdatedCount}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedFamilyId(null)} style={smallBtn}>
                <X size={14} strokeWidth={2} />
                Kapat
              </button>
            </div>

            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Detay filtreler + aksiyonlar */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1.2fr) auto',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
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
                    placeholder="Detayda stok ara..."
                    value={detailSearch}
                    onChange={(event) => setDetailSearch(event.target.value)}
                    style={{ ...inputStyle, paddingLeft: 32 }}
                  />
                </div>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    height: 36,
                    padding: '0 12px',
                    border: `1px solid #e3e8f0`,
                    borderRadius: 8,
                    background: '#fff',
                    fontSize: 12.5,
                    color: INK,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={onlyIssues}
                    onChange={(event) => setOnlyIssues(event.target.checked)}
                  />
                  Sadece sorunlu stoklar
                </label>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 8,
                    fontSize: 12,
                    color: FAINT,
                  }}
                >
                  <button
                    type="button"
                    onClick={updateDirtyCosts}
                    disabled={bulkUpdating}
                    style={{
                      ...smallBtn,
                      opacity: bulkUpdating ? 0.6 : 1,
                      cursor: bulkUpdating ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {bulkUpdating ? 'Guncelleniyor...' : 'Fiyat girilenleri guncelle'}
                  </button>
                  <button type="button" onClick={saveDetailColumnWidths} style={smallBtn}>
                    Gorunumu Kaydet
                  </button>
                  <button type="button" onClick={resetDetailColumnWidths} style={smallBtn}>
                    Sifirla
                  </button>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {filteredDetailItems.length} satir gosteriliyor
                  </span>
                </div>
              </div>

              {/* Detay tablo (resize) */}
              <div style={{ overflowX: 'auto', border: `1px solid ${LINE}`, borderRadius: 10 }}>
                <table
                  style={{
                    tableLayout: 'fixed',
                    fontSize: 12,
                    width: detailTableWidth,
                    borderCollapse: 'collapse',
                  }}
                >
                  <colgroup>
                    {DETAIL_COLUMN_KEYS.map((key) => (
                      <col key={key} style={{ width: detailColumnWidths[key] }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {renderResizableHeader('stock', 'Stok')}
                      {renderResizableHeader('status', 'Durum', 'center')}
                      {renderResizableHeader('currentCost', 'Guncel Maliyet', 'right')}
                      {renderResizableHeader('currentCostDate', 'Guncel Maliyet Tarihi', 'center')}
                      {renderResizableHeader('lastEntryPrice', 'Son Giris', 'right')}
                      {renderResizableHeader('lastEntryDate', 'Son Giris Tarihi', 'center')}
                      {renderResizableHeader('daysBehind', 'Gun Farki', 'center')}
                      {renderResizableHeader('newCost', 'Yeni Maliyet', 'right')}
                      {renderResizableHeader('action', 'Islem', 'right')}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDetailItems.length === 0 && (
                      <tr>
                        <td
                          colSpan={9}
                          style={{ padding: '40px 12px', textAlign: 'center', color: MUTED }}
                        >
                          Filtreye uygun stok yok.
                        </td>
                      </tr>
                    )}
                    {filteredDetailItems.map((item) => {
                      const code = item.productCode;
                      return (
                        <tr key={item.id} style={{ borderTop: `1px solid ${ROW_LINE}` }}>
                          <td style={{ padding: '11px 12px', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 600, color: INK }}>{code}</div>
                            <div
                              style={{
                                maxWidth: 360,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: 11,
                                color: MUTED,
                              }}
                              title={item.productName || ''}
                            >
                              {item.productName || '-'}
                            </div>
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'center' }}>
                            <span style={issueBadge(item.issueType)}>{issueLabel(item.issueType)}</span>
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => applyCurrentCostToInputs(item)}
                              disabled={!item.currentCost}
                              title="Bu guncel maliyeti sagdaki fiyat kutusuna aktar"
                              style={{
                                fontWeight: 700,
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                fontFamily: 'inherit',
                                fontSize: 12,
                                cursor: item.currentCost ? 'pointer' : 'default',
                                color: item.currentCost ? PRIMARY : FAINT,
                                textDecoration: item.currentCost ? 'underline' : 'none',
                                textUnderlineOffset: 2,
                              }}
                            >
                              {formatCurrency(item.currentCost)}
                            </button>
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'center', color: MUTED }}>
                            {formatDate(item.currentCostDate)}
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'right', color: INK }}>
                            {formatCurrency(item.lastEntryPrice)}
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'center', color: MUTED }}>
                            {formatDate(item.lastEntryDate)}
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'center', color: INK }}>
                            {item.daysBehind ?? '-'}
                          </td>
                          <td style={{ padding: '11px 12px' }}>
                            <div
                              style={{
                                display: 'flex',
                                minWidth: 360,
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                gap: 8,
                                flexWrap: 'wrap',
                              }}
                            >
                              <label style={{ fontSize: 10.5, color: FAINT, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                P
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={costPInputByCode[code] ?? ''}
                                  onChange={(event) => {
                                    const rawValue = event.target.value;
                                    setCostPInputByCode((prev) => ({ ...prev, [code]: rawValue }));
                                    markCostDirty(code);
                                    if (manualCostTByCode[code]) return;
                                    const parsed = Number(String(rawValue || '').replace(',', '.'));
                                    if (!Number.isFinite(parsed)) return;
                                    setCostTInputByCode((prev) => ({
                                      ...prev,
                                      [code]: formatInputNumber(computeCostT(parsed, item.vatRate)),
                                    }));
                                  }}
                                  style={numInput}
                                />
                              </label>
                              <label style={{ fontSize: 10.5, color: FAINT, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                T
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={costTInputByCode[code] ?? ''}
                                  onChange={(event) => {
                                    setManualCostTByCode((prev) => ({ ...prev, [code]: true }));
                                    setCostTInputByCode((prev) => ({ ...prev, [code]: event.target.value }));
                                    markCostDirty(code);
                                  }}
                                  style={numInput}
                                />
                              </label>
                              <span style={{ fontSize: 10, color: FAINT }}>
                                KDV %{getVatPercent(item.vatRate).toLocaleString('tr-TR')}
                              </span>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: MUTED }}>
                                <input
                                  type="checkbox"
                                  checked={updatePriceListsByCode[code] !== false}
                                  onChange={(event) =>
                                    setUpdatePriceListsByCode((prev) => ({ ...prev, [code]: event.target.checked }))
                                  }
                                />
                                10 liste
                              </label>
                            </div>
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => updateProductCost(item)}
                              disabled={Boolean(updatingCostByCode[code])}
                              style={{
                                ...smallBtn,
                                marginLeft: 'auto',
                                opacity: updatingCostByCode[code] ? 0.6 : 1,
                                cursor: updatingCostByCode[code] ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {updatingCostByCode[code] ? '...' : 'Guncelle'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Son Maliyet Guncellemeleri (audit) */}
              <div
                style={{
                  border: `1px solid ${LINE}`,
                  borderRadius: 10,
                  background: '#f9fafc',
                  padding: 14,
                }}
              >
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: INK }}>
                  Son Maliyet Guncellemeleri
                </p>
                {selectedFamily.recentLogs.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
                    Bu aile icin henuz audit kaydi yok.
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {selectedFamily.recentLogs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          border: `1px solid ${LINE}`,
                          borderRadius: 8,
                          background: '#fff',
                          padding: 10,
                          fontSize: 11.5,
                          color: MUTED,
                        }}
                      >
                        <div style={{ fontWeight: 600, color: INK }}>{log.productCode}</div>
                        <div>
                          {formatCurrency(log.previousCost)} {'->'} {formatCurrency(log.newCost)}
                        </div>
                        <div>
                          {formatDate(log.previousCostDate)} {'->'} {formatDate(log.newCostDate)}
                        </div>
                        <div style={{ color: FAINT, marginTop: 2 }}>
                          {new Date(log.createdAt).toLocaleString('tr-TR')}{' '}
                          {log.updatePriceLists ? '/ 10 liste' : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
