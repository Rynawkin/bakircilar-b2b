'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Yeni tema (New) marj/genel dislama ekleme icin tekrar kullanilabilir inline combobox.
 *
 * - Serbest metin girisine izin verir (dropdown zorunlu degildir).
 * - 300ms debounce ile `fetchSuggestions(search)` cagirir; sonuclari dropdown'da gosterir.
 * - Klavye (ArrowUp/ArrowDown/Enter/Escape) + fare tiklama ile secim.
 * - Bir oneri secildiginde `onSelect(suggestion)` calisir; serbest metinle Enter'da
 *   (aktif bir highlight yoksa) `onSubmitFreeText(value)` calisir.
 *
 * Kullanan: KarMarjiUyumNew dislama paneli (Marj + Genel sekmeleri).
 */

const INK = '#14223b';
const MUTED = '#51607a';
const FAINT = '#8b97ac';
const SOFT_LINE = '#eef1f6';
const ROW_LINE = '#f1f4f9';
const PRIMARY = '#15356b';
const HIGHLIGHT_BG = '#eef2fa';

export interface ExclusionSuggestion {
  /** Kurala yazilacak deger (or. marka kodu, stok kodu veya stok adi). */
  value: string;
  /** Ekranda gosterilecek etiket (or. stok adi, cari unvani). */
  label: string;
  /** Opsiyonel sag-yaslanmis meta (or. "12 urun" veya cari kodu). */
  meta?: string | null;
}

const inputStyle: React.CSSProperties = {
  height: 36,
  width: '100%',
  border: '1px solid #e3e8f0',
  borderRadius: 8,
  padding: '0 10px',
  fontSize: 12.5,
  color: INK,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
};

interface Props {
  /** Kontrollu input degeri (serbest metin). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minWidth?: number;
  flex?: number;
  /** Oneri kaynagi. Bos string arama da desteklenmeli (ilk N kayit). */
  fetchSuggestions: (search: string) => Promise<ExclusionSuggestion[]>;
  /** Dropdown'dan bir oneri secildiginde. */
  onSelect: (suggestion: ExclusionSuggestion) => void;
  /** Serbest metinle (oneri secmeden) Enter'a basildiginda. */
  onSubmitFreeText?: (value: string) => void;
  /**
   * `fetchSuggestions` cikisini yeniden tetiklemek icin degisen anahtar
   * (or. secili dislama tipi). Degisince oneriler yeniden yuklenir.
   */
  refetchKey?: string;
}

export default function ExclusionCombobox({
  value,
  onChange,
  placeholder,
  disabled,
  minWidth = 220,
  flex = 1,
  fetchSuggestions,
  onSelect,
  onSubmitFreeText,
  refetchKey,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ExclusionSuggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef(0);

  // 300ms debounce ile oneri cek. refetchKey degisince de yeniden tetiklenir.
  useEffect(() => {
    const requestId = ++requestRef.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await fetchSuggestions(value.trim());
        if (!cancelled && requestRef.current === requestId) {
          setOptions(Array.isArray(result) ? result : []);
          setHighlight(-1);
        }
      } catch {
        if (!cancelled && requestRef.current === requestId) setOptions([]);
      } finally {
        if (!cancelled && requestRef.current === requestId) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, refetchKey]);

  // Dis tiklamada dropdown'i kapat.
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (suggestion: ExclusionSuggestion) => {
    onSelect(suggestion);
    setOpen(false);
    setHighlight(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((prev) => (options.length === 0 ? -1 : (prev + 1) % options.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((prev) => (options.length === 0 ? -1 : (prev - 1 + options.length) % options.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && highlight >= 0 && highlight < options.length) {
        handleSelect(options[highlight]);
      } else if (onSubmitFreeText && value.trim()) {
        onSubmitFreeText(value.trim());
        setOpen(false);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', flex, minWidth }}>
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{ ...inputStyle, opacity: disabled ? 0.6 : 1 }}
        autoComplete="off"
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            right: 0,
            zIndex: 40,
            border: `1px solid ${SOFT_LINE}`,
            borderRadius: 8,
            background: '#fff',
            boxShadow: '0 12px 30px rgba(15,23,42,.12)',
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {loading ? (
            <div style={{ padding: 10, fontSize: 12, color: FAINT }}>Yukleniyor...</div>
          ) : options.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: FAINT }}>
              {value.trim() ? 'Oneri yok — Enter ile serbest ekleyebilirsiniz.' : 'Aramaya baslayin...'}
            </div>
          ) : (
            options.map((option, index) => {
              const active = index === highlight;
              return (
                <button
                  key={`${option.value}-${index}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => handleSelect(option)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '8px 10px',
                    border: 'none',
                    borderBottom: `1px solid ${ROW_LINE}`,
                    background: active ? HIGHLIGHT_BG : '#fff',
                    fontSize: 12.5,
                    color: INK,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    style={{
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: active ? PRIMARY : INK,
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {option.label}
                  </span>
                  {option.meta ? (
                    <span style={{ fontSize: 11, color: MUTED, whiteSpace: 'nowrap', flex: 'none' }}>
                      {option.meta}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
