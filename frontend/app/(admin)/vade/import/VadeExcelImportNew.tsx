'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  Upload,
  FileSpreadsheet,
  X,
  RefreshCw,
  CheckCircle2,
  SkipForward,
  ListChecks,
  UserPlus,
} from 'lucide-react';
import { useVadeExcelImport } from './useVadeExcelImport';
import type { VadeImportSkipReason } from '@/lib/vadeExcelImport';

/**
 * Yeni gorunum: Vade Excel Import.
 * Tum mantik useVadeExcelImport hook'undan gelir; hicbir handler/buton/sonuc dusurulmemistir.
 * (Dosya secimi -> setFile; Import Et -> handleImport; Temizle -> setFile(null); sonuc -> summary.)
 *
 * Tasarim referansi: design HTML genel rapor/ekran stili + brief 4.7.6.
 * Beyaz kart #fff / border #e7ebf2 / radius 12px; primary #15356b;
 * ink #14223b/#51607a/#8b97ac; emerald/amber. lucide ikon; EMOJI YOK.
 * Drag-drop sadece UI; mevcut <input type=file> ile birebir ayni setFile akisini kullanir.
 */

const PRIMARY = '#15356b';
const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const LINE = '#e7ebf2';
const SOFT_LINE = '#eef1f6';
const TABLE_HEAD_BG = '#fafbfd';
const EMERALD = '#047857';
const AMBER = '#b45309';

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${LINE}`,
  borderRadius: 12,
};

const headBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  height: 38,
  padding: '0 16px',
  border: `1px solid ${LINE}`,
  borderRadius: 9,
  background: '#fff',
  color: INK,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

// Otomatik eslenen kolonlar (brief 4.7.6). Sadece bilgilendirme amacli;
// gercek esleme frontend/lib/vadeExcelImport.ts icindeki saf parser'dadir.
const MAPPED_COLUMNS: { label: string; hint: string; required?: boolean }[] = [
  { label: 'Cari hesap kodu', hint: '"cari hesap kodu"', required: true },
  { label: 'Cari hesap adı', hint: '"cari hesap adı"', required: true },
  { label: 'Sektör kodu', hint: '"sektör kodu"', required: true },
  { label: 'Grup kodu', hint: '"grup kodu"', required: true },
  { label: 'Bölge kodu', hint: '"bölge kodu"' },
  { label: 'Vadesi geçen bakiye', hint: '"vadesi geçen bakiye"', required: true },
  { label: 'Vadesi geçen bakiye vadesi', hint: '"vadesi geçen bakiye vadesi"', required: true },
  { label: 'Vadesi geçmemiş bakiye', hint: '"vadesi geçmemiş bakiye"', required: true },
  { label: 'Vadesi geçmemiş bakiye vadesi', hint: '"vadesi geçmemiş bakiye vadesi"', required: true },
  { label: 'Toplam bakiye', hint: '"toplam bakiye"', required: true },
  { label: 'Valör', hint: '"valör"', required: true },
  { label: 'Cari ödeme vadesi', hint: '"cari ödeme vadesi"' },
  { label: 'Bakiyeye konu ilk evrak (referans tarih)', hint: '"bakiyeye konu ilk evrak"' },
];

const SKIP_REASON_LABELS: Record<VadeImportSkipReason, string> = {
  CUSTOMER_NOT_FOUND: 'Cari bulunamadı',
  EXCLUDED_SECTOR: 'Sektör kapsam dışı',
  DUPLICATE_CODE: 'Mükerrer cari kodu',
};

export default function VadeExcelImportNew() {
  const { file, setFile, loading, summary, handleImport } = useVadeExcelImport();

  // Drag-drop sadece gorsel kolaylik; secilen dosya yine ayni setFile'a yazilir.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 24 }}>
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
        <Link href="/vade" style={{ color: FAINT, textDecoration: 'none', fontWeight: 500 }}>
          Vade Takip
        </Link>
        <ChevronRight size={13} strokeWidth={2} />
        <span style={{ color: MUTED, fontWeight: 500 }}>Vade Excel Import</span>
      </div>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 18,
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
            Vade Excel Import
          </h1>
          <div style={{ fontSize: 13, color: FAINT, marginTop: 5 }}>
            Muhasebe raporundaki cariler tek işlemde güncellenir; dosyada olmayan kayıtlar silinmez.
            B2B&apos;de bulunmayan cariler girişe kapalı vade carisi olarak oluşturulur.
          </div>
        </div>
      </div>

      {/* Yukleme karti */}
      <div style={{ ...cardStyle, padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 12 }}>
          Excel Dosyası
        </div>

        {/* Drag-drop alani -> tiklayinca gizli input acilir; ayni setFile akisi */}
        <div
          onClick={() => {
            if (!loading) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!loading) setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (loading) return;
            const dropped = e.dataTransfer.files?.[0] || null;
            if (dropped) setFile(dropped);
          }}
          style={{
            border: `1.5px dashed ${dragActive ? PRIMARY : '#cdd6e4'}`,
            borderRadius: 11,
            background: dragActive ? '#f4f7fc' : '#fafbfd',
            padding: '28px 20px',
            textAlign: 'center',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'border-color .15s, background .15s',
          }}
        >
          <Upload
            size={26}
            strokeWidth={1.8}
            style={{ color: dragActive ? PRIMARY : FAINT, margin: '0 auto 10px', display: 'block' }}
          />
          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
            Dosyayı sürükleyin veya seçmek için tıklayın
          </div>
          <div style={{ fontSize: 12, color: FAINT, marginTop: 4 }}>
            Desteklenen biçim: .xlsx, .xls
          </div>

          {/* Mevcut input type=file: gizli ama AYNI onChange/setFile mantigi */}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            style={{ display: 'none' }}
          />
        </div>

        {/* Secili dosya ozeti */}
        {file && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 12,
              padding: '10px 12px',
              border: `1px solid ${LINE}`,
              borderRadius: 9,
              background: '#f8fafc',
            }}
          >
            <FileSpreadsheet size={18} strokeWidth={2} style={{ color: EMERALD, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: INK,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={file.name}
              >
                {file.name}
              </div>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>
                {(file.size / 1024).toFixed(1)} KB
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFile(null)}
              disabled={loading}
              title="Dosyayı kaldır"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                border: `1px solid ${LINE}`,
                borderRadius: 7,
                background: '#fff',
                color: MUTED,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        )}

        {/* Aksiyonlar: Import Et / Temizle (mevcut handler'lar) */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleImport}
            disabled={loading || !file}
            style={{
              ...headBtn,
              background: PRIMARY,
              color: '#fff',
              border: 'none',
              opacity: loading || !file ? 0.6 : 1,
              cursor: loading || !file ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <RefreshCw size={15} strokeWidth={2} className="animate-spin" />
            ) : (
              <Upload size={15} strokeWidth={2} />
            )}
            {loading ? 'Yükleniyor...' : 'Import Et'}
          </button>
          <button
            type="button"
            onClick={() => setFile(null)}
            disabled={loading}
            style={{
              ...headBtn,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <X size={15} strokeWidth={2} />
            Temizle
          </button>
        </div>
      </div>

      {/* Snapshot sonucu ve atlama nedenleri */}
      {summary && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div style={{ ...cardStyle, padding: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11.5,
                  color: FAINT,
                }}
              >
                <CheckCircle2 size={15} strokeWidth={2} style={{ color: EMERALD }} />
                Aktarılan
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, color: EMERALD, marginTop: 6 }}>
                {summary.imported}
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11.5,
                  color: FAINT,
                }}
              >
                <UserPlus size={15} strokeWidth={2} style={{ color: PRIMARY }} />
                Yeni cari
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, color: PRIMARY, marginTop: 6 }}>
                {summary.createdCustomers}
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11.5,
                  color: FAINT,
                }}
              >
                <SkipForward size={15} strokeWidth={2} style={{ color: AMBER }} />
                Atlanan
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, color: AMBER, marginTop: 6 }}>
                {summary.skipped}
              </div>
            </div>
          </div>

          {summary.skipped > 0 && (
            <div style={{ ...cardStyle, padding: 16, marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 10 }}>
                Atlama nedenleri
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: summary.skippedRows.length ? 12 : 0 }}>
                <span style={{ fontSize: 11.5, color: MUTED, background: '#fff7ed', borderRadius: 999, padding: '5px 9px' }}>
                  Cari bulunamadı: {summary.skipReasons.customerNotFound}
                </span>
                <span style={{ fontSize: 11.5, color: MUTED, background: '#fff7ed', borderRadius: 999, padding: '5px 9px' }}>
                  Sektör kapsam dışı: {summary.skipReasons.excludedSector}
                </span>
                <span style={{ fontSize: 11.5, color: MUTED, background: '#fff7ed', borderRadius: 999, padding: '5px 9px' }}>
                  Mükerrer kod: {summary.skipReasons.duplicateCode}
                </span>
              </div>
              {summary.skippedRows.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <thead>
                      <tr style={{ color: FAINT, textAlign: 'left', borderBottom: `1px solid ${LINE}` }}>
                        <th style={{ padding: '7px 8px' }}>Excel satırı</th>
                        <th style={{ padding: '7px 8px' }}>Cari kodu</th>
                        <th style={{ padding: '7px 8px' }}>Neden</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.skippedRows.slice(0, 20).map((row, index) => (
                        <tr
                          key={`${row.sourceRowNumber ?? 'row'}-${row.mikroCariCode}-${index}`}
                          style={{ borderBottom: `1px solid ${SOFT_LINE}`, color: MUTED }}
                        >
                          <td style={{ padding: '7px 8px' }}>{row.sourceRowNumber ?? '—'}</td>
                          <td style={{ padding: '7px 8px', fontFamily: "'Roboto Mono', monospace" }}>
                            {row.mikroCariCode}
                          </td>
                          <td style={{ padding: '7px 8px' }}>{SKIP_REASON_LABELS[row.reason]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {summary.skipped > 20 && (
                    <div style={{ color: FAINT, fontSize: 11, marginTop: 8 }}>
                      İlk 20 ayrıntı gösteriliyor; toplam {summary.skipped} atlanan satır var.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Otomatik kolon eslesme bilgi karti (brief 4.7.6) */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '13px 16px',
            borderBottom: `1px solid ${SOFT_LINE}`,
          }}
        >
          <ListChecks size={16} strokeWidth={2} style={{ color: PRIMARY }} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
            Otomatik Eşlenen Kolonlar
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 90px',
            gap: 10,
            padding: '10px 16px',
            background: TABLE_HEAD_BG,
            borderBottom: `1px solid ${SOFT_LINE}`,
            fontSize: 10,
            fontWeight: 600,
            color: FAINT,
            textTransform: 'uppercase',
          }}
        >
          <span>Alan</span>
          <span>Excel Başlığı (içerir)</span>
          <span style={{ textAlign: 'right' }}>Zorunlu</span>
        </div>

        {MAPPED_COLUMNS.map((col) => (
          <div
            key={col.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 90px',
              gap: 10,
              padding: '11px 16px',
              borderTop: `1px solid #f1f4f9`,
              fontSize: 12,
              color: INK,
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 500 }}>{col.label}</span>
            <span style={{ color: MUTED, fontFamily: "'Roboto Mono', monospace", fontSize: 11 }}>
              {col.hint}
            </span>
            <span style={{ textAlign: 'right' }}>
              {col.required ? (
                <span style={{ color: PRIMARY, fontWeight: 700 }}>Evet</span>
              ) : (
                <span style={{ color: FAINT }}>—</span>
              )}
            </span>
          </div>
        ))}

        <div
          style={{
            padding: '11px 16px',
            borderTop: `1px solid ${SOFT_LINE}`,
            fontSize: 11.5,
            color: FAINT,
          }}
        >
          Başlık satırı ilk 50 satır içinde otomatik bulunur. Kolonlar önce tam başlık adına göre
          eşlenir; sıra önemli değildir. Zorunlu kolonlardan biri bulunamazsa import veri yazmadan durur.
        </div>
      </div>
    </div>
  );
}
