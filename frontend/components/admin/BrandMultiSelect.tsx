'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X, Tag } from 'lucide-react';
import adminApi from '@/lib/api/admin';

/**
 * Banner "birden fazla marka" secici.
 * Secilen markalar banner tiklamasinda /products?brands=A,B,C sayfasina gider.
 * Marka listesi tek sefer /admin/brands'ten cekilir ve modul icinde cache'lenir.
 */

// Modul-seviyesi cache: her acilista tekrar cekilmesin (hiz)
let BRANDS_CACHE: string[] | null = null;
let BRANDS_PROMISE: Promise<string[]> | null = null;

async function loadBrands(): Promise<string[]> {
  if (BRANDS_CACHE) return BRANDS_CACHE;
  if (!BRANDS_PROMISE) {
    BRANDS_PROMISE = adminApi
      .getBrands()
      .then((res) => {
        BRANDS_CACHE = res.brands || [];
        return BRANDS_CACHE;
      })
      .catch(() => {
        BRANDS_PROMISE = null;
        return [];
      });
  }
  return BRANDS_PROMISE;
}

interface BrandMultiSelectProps {
  value: string[];
  onChange: (codes: string[]) => void;
  label?: string;
  hint?: string;
}

export function BrandMultiSelect({ value, onChange, label = 'Markalar', hint }: BrandMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [brands, setBrands] = useState<string[]>(BRANDS_CACHE || []);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    if (!BRANDS_CACHE) setLoading(true);
    loadBrands().then((list) => {
      if (!mounted) return;
      setBrands(list);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Disari tiklayinca kapat
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return brands;
    return brands.filter((b) => b.toLocaleLowerCase('tr').includes(q));
  }, [brands, query]);

  const toggle = (code: string) => {
    if (value.includes(code)) onChange(value.filter((c) => c !== code));
    else onChange([...value, code]);
  };

  return (
    <div ref={wrapRef} className="relative">
      {label && <label className="mb-1.5 block text-[12px] font-medium text-[#51607a]">{label}</label>}

      {/* Secilen markalar */}
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-md bg-[#eef2fa] px-2 py-1 text-[12px] font-medium text-[#15356b] ring-1 ring-inset ring-[#d6e0f1]"
            >
              <Tag className="h-3 w-3" />
              {code}
              <button
                type="button"
                onClick={() => toggle(code)}
                className="ml-0.5 rounded hover:text-[#dc2626]"
                aria-label={`${code} kaldır`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Acilir buton */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-[#e3e8f0] px-3.5 py-2.5 text-[13px] text-[#14223b] outline-none transition hover:border-[#c9d3e2] focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/15"
      >
        <span className={value.length ? 'text-[#14223b]' : 'text-[#9aa6b8]'}>
          {value.length ? `${value.length} marka seçili` : 'Marka seçin (opsiyonel)'}
        </span>
        <ChevronDown className={`h-4 w-4 text-[#8b97ac] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {hint && <p className="mt-1.5 text-[11px] text-[#8b97ac]">{hint}</p>}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-[#e3e8f0] bg-white shadow-lg">
          <div className="border-b border-[#f1f4f9] p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9aa6b8]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Marka ara…"
                className="w-full rounded-md border border-[#e3e8f0] py-1.5 pl-8 pr-2 text-[12.5px] outline-none focus:border-[#15356b]"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-4 text-center text-[12px] text-[#8b97ac]">Yükleniyor…</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-[#8b97ac]">Marka bulunamadı</p>
            ) : (
              filtered.map((code) => {
                const selected = value.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggle(code)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] transition hover:bg-[#f4f6fa] ${
                      selected ? 'font-medium text-[#15356b]' : 'text-[#14223b]'
                    }`}
                  >
                    <span className="truncate">{code}</span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-[#15356b]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BrandMultiSelect;
