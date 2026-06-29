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
} from 'lucide-react';
import { useVadeExcelImport } from './useVadeExcelImport';

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

// Otomatik eslenen kolonlar (brief 4.7.6). Sadece bilgilendirme amacli; logic findColumnIndex'te.
const MAPPED_COLUMNS: { label: string; hint: string; required?: boolean }[] = [
  { label: 'Cari hesap kodu', hint: '"cari hesap kodu"', required: true },
  { label: 'Vadesi geçen bakiye', hint: '"vadesi geçen bakiye"' },
  { label: 'Vadesi geçen bakiye vadesi', hint: '"vadesi geçen bakiye vadesi"' },
  { label: 'Vadesi geçmemiş bakiye', hint: '"vadesi geçmemiş bakiye"' },
  { label: 'Vadesi geçmemiş bakiye vadesi', hint: '"vadesi geçmemiş bakiye vadesi"' },
  { label: 'Toplam bakiye', hint: '"toplam bakiye"' },
  { label: 'Valör', hint: '"valör"' },
  { label: 'Cari ödeme vadesi', hint: '"cari ödeme vadesi"' },
  { label: 'Bakiyeye konu ilk evrak (referans tarih)', hint: '"bakiyeye konu ilk evrak"' },
];

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
            Muhasebe raporunu buradan yükleyebilirsiniz.
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

      {/* Sonuc kartlari: Aktarilan / Atlanan */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 14,
            marginBottom: 18,
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
              <SkipForward size={15} strokeWidth={2} style={{ color: AMBER }} />
              Atlanan
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: AMBER, marginTop: 6 }}>
              {summary.skipped}
            </div>
          </div>
        </div>
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
          Kolonlar başlık adına göre otomatik eşlenir; sıra önemli değildir. Cari hesap kodu
          bulunamazsa import durur.
        </div>
      </div>
    </div>
  );
}
