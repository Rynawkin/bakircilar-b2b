'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { LayoutGrid, Layers, Search, ArrowRight, Percent, ArrowLeftRight } from 'lucide-react';
import { Category } from '@/types';
import customerApi, { Banner } from '@/lib/api/customer';
import { useDebounce } from '@/lib/hooks/useDebounce';

/** Sol filtre rayindaki stok durumu segmenti degeri */
export type StockStatus = 'all' | 'in' | 'supply';

/** Rail'in tek kaynak filtre durumu — sayfa bu state'i tutar, rail sunar/degistirir. */
export interface RailFilters {
  minPrice?: number;
  maxPrice?: number;
  stockStatus: StockStatus;
  onlyDiscount: boolean;
  onlyAgreement: boolean;
}

/** Rail'de gosterilen kategori satiri (denenmemis modunda pill icin) */
export interface RailCategory {
  id: string;
  name: string;
  count?: number;
}

interface FilterRailProps {
  /** Rail'de listelenecek kategoriler (kok kategoriler / denenmemis kategoriler) */
  categories: RailCategory[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
  /** true iken kategori kartinda "DENENMEMIS" pill'i gosterilir (new-categories modu) */
  showUnboughtPill?: boolean;
  /** Kategori kartinin altindaki "Tumu" satiri gorunsun mu (varsayilan: true) */
  showAllCategoryRow?: boolean;

  /** Cok-secimli marka kodlari (URL-param senkronuyla ortak) */
  brandCodes: string[];
  onBrandToggle: (code: string) => void;
  /** Marka facet baglami: kategori + arama filtresi (backend'e gecer) */
  brandContextCategoryId?: string;
  /** Marka karti gorunsun mu (varsayilan: true; new-categories'de kapali) */
  showBrandCard?: boolean;

  /** Stok durumu + indirim/anlasma + fiyat araligi filtreleri */
  filters: RailFilters;
  onFiltersChange: (patch: Partial<RailFilters>) => void;

  /** Anlasma satiri sadece anlasma erisimi varken gosterilsin (nav ile tutarli) */
  showAgreementRow?: boolean;
  /** Zaten yalniz indirimli urun gosteren sayfalarda gereksiz satiri gizler. */
  showDiscountRow?: boolean;

  /** SIDE banner fallback hedefi */
  bannerHref?: string;
}

/**
 * Vitrin liste ekranlari icin paylasilan sol FILTRE RAYI.
 * Kartlar: Kategori · Marka (cok-secim) · Stok durumu · Fiyat araligi + SIDE banner.
 * Reskin — mevcut filtre state'ine baglanir; hicbir veri/fiyat mantigini degistirmez.
 * Faz-3 sayfalari (discounted/previously/new-categories) products/page.tsx'i sablon alarak
 * bu bileseni ayni proplarla yeniden kullanir.
 */
export function FilterRail({
  categories,
  selectedCategoryId,
  onSelectCategory,
  showUnboughtPill = false,
  showAllCategoryRow = true,
  brandCodes,
  onBrandToggle,
  brandContextCategoryId,
  showBrandCard = true,
  filters,
  onFiltersChange,
  showAgreementRow = true,
  showDiscountRow = true,
  bannerHref = '/discounted-products',
}: FilterRailProps) {
  const [sideBanner, setSideBanner] = useState<Banner | null>(null);
  const [brandQuery, setBrandQuery] = useState('');
  const [brandFacets, setBrandFacets] = useState<Array<{ code: string; name: string; count: number }>>([]);
  const debouncedBrandQuery = useDebounce(brandQuery, 300);
  const brandReqRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;
    customerApi
      .getBanners('SIDE')
      .then(({ banners }) => {
        if (mounted && banners && banners.length > 0) setSideBanner(banners[0]);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Marka facet'leri: kategori baglami + arama ile backend'den. Secili markalar (URL'den
  // gelmis olabilir) listede olmasa da chip/pill olarak korunur.
  useEffect(() => {
    if (!showBrandCard) return;
    brandReqRef.current?.abort();
    const controller = new AbortController();
    brandReqRef.current = controller;
    customerApi
      .getBrandFacets({
        categoryId: brandContextCategoryId || undefined,
        search: debouncedBrandQuery.trim() || undefined,
      })
      .then((data) => {
        if (brandReqRef.current !== controller) return;
        setBrandFacets(data.brands || []);
      })
      .catch(() => {
        if (brandReqRef.current === controller) setBrandFacets([]);
      })
      .finally(() => {
        if (brandReqRef.current === controller) brandReqRef.current = null;
      });
    return () => controller.abort();
  }, [brandContextCategoryId, debouncedBrandQuery, showBrandCard]);

  // Secili ama facette olmayan markalar da gorunsun (URL'den gelen banner secimi gibi)
  const brandRows = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    brandFacets.forEach((b) => map.set(b.code, b));
    brandCodes.forEach((code) => {
      if (!map.has(code)) map.set(code, { code, name: code, count: 0 });
    });
    const q = debouncedBrandQuery.trim().toLocaleLowerCase('tr');
    return Array.from(map.values()).filter(
      (b) => !q || b.name.toLocaleLowerCase('tr').includes(q) || b.code.toLocaleLowerCase('tr').includes(q)
    );
  }, [brandFacets, brandCodes, debouncedBrandQuery]);

  const bannerLink = sideBanner
    ? sideBanner.linkUrl || (sideBanner.productCode ? `/products?search=${encodeURIComponent(sideBanner.productCode)}` : '/products')
    : bannerHref;

  const catRowClass = (active: boolean) =>
    `flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
      active ? 'bg-[#eef2fa] font-semibold text-[#15356b]' : 'text-[#14223b] hover:bg-[#f6f8fc]'
    }`;

  const segBtnClass = (active: boolean) =>
    `flex-1 rounded-[7px] py-1.5 text-[12px] font-medium transition-colors ${
      active ? 'bg-white text-[#15356b] shadow-[0_1px_2px_rgba(20,34,59,.08)]' : 'text-[#51607a] hover:text-[#14223b]'
    }`;

  const checkBox = (active: boolean, color: 'navy' | 'emerald') => {
    const on = color === 'emerald' ? 'border-[#059669] bg-[#059669]' : 'border-[#1c4585] bg-[#1c4585]';
    return `flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors ${
      active ? on : 'border-[#cdd6e5] bg-white'
    }`;
  };

  return (
    <aside className="flex flex-col gap-3.5 lg:sticky lg:top-[120px]">
      {/* Kategori karti */}
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_1px_2px_rgba(20,34,59,.04)]">
        <div className="flex items-center gap-2 border-b border-[#eef1f6] px-3.5 py-3">
          <LayoutGrid className="h-[15px] w-[15px] text-[#15356b]" />
          <span className="text-[13px] font-semibold text-[#14223b]">Kategori</span>
          {showUnboughtPill && (
            <span className="ml-auto rounded-full border border-[#a7f3d0] bg-[#ecfdf5] px-[7px] py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-[#047857]">
              denenmemiş
            </span>
          )}
        </div>
        <div className="flex max-h-[288px] flex-col gap-px overflow-auto p-[7px]">
          {showAllCategoryRow && (
            <button type="button" onClick={() => onSelectCategory('')} className={catRowClass(!selectedCategoryId)}>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">Tümü</span>
            </button>
          )}
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectCategory(c.id)}
              className={catRowClass(selectedCategoryId === c.id)}
              title={c.name}
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{c.name}</span>
              {typeof c.count === 'number' && (
                <span className="flex-none text-[11px] text-[#9aa6b8]">{c.count}</span>
              )}
            </button>
          ))}
          {categories.length === 0 && (
            <div className="px-2.5 py-2 text-[12px] text-[#9aa6b8]">Kategori yok</div>
          )}
        </div>
      </div>

      {/* Marka karti (cok-secim) */}
      {showBrandCard && (
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_1px_2px_rgba(20,34,59,.04)]">
        <div className="flex items-center gap-2 border-b border-[#eef1f6] px-3.5 py-3">
          <Layers className="h-[15px] w-[15px] text-[#15356b]" />
          <span className="text-[13px] font-semibold text-[#14223b]">Marka</span>
          {brandCodes.length > 0 && (
            <span className="ml-auto rounded-full border border-[#d6e0f1] bg-[#eef2fa] px-[7px] py-0.5 text-[10px] font-semibold text-[#1c4585]">
              {brandCodes.length} seçili
            </span>
          )}
        </div>
        <div className="px-3 pb-2 pt-2.5">
          <div className="flex h-[34px] items-center gap-[7px] rounded-lg border border-[#e3e8f0] bg-white px-2.5">
            <Search className="h-3.5 w-3.5 text-[#9aa6b8]" />
            <input
              value={brandQuery}
              onChange={(e) => setBrandQuery(e.target.value)}
              placeholder="Marka ara…"
              className="min-w-0 flex-1 border-none bg-transparent text-[12.5px] text-[#14223b] outline-none"
            />
          </div>
        </div>
        <div className="flex max-h-[232px] flex-col gap-px overflow-auto px-[7px] pb-[7px]">
          {brandRows.map((b) => {
            const active = brandCodes.includes(b.code);
            return (
              <button
                key={b.code}
                type="button"
                onClick={() => onBrandToggle(b.code)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-[#f6f8fc]"
                title={b.name}
              >
                <span className={checkBox(active, 'navy')}>
                  {active && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#14223b]">{b.name}</span>
                {b.count > 0 && <span className="flex-none text-[11px] text-[#9aa6b8]">{b.count}</span>}
              </button>
            );
          })}
          {brandRows.length === 0 && (
            <div className="py-2.5 text-center text-[12px] text-[#9aa6b8]">Marka bulunamadı</div>
          )}
        </div>
      </div>
      )}

      {/* Stok durumu karti */}
      <div className="rounded-xl border border-[var(--line)] bg-white p-3.5 shadow-[0_1px_2px_rgba(20,34,59,.04)]">
        <div className="mb-2.5 text-[13px] font-semibold text-[#14223b]">Stok durumu</div>
        <div className="mb-2.5 flex gap-[3px] rounded-[9px] bg-[#f1f4f9] p-[3px]">
          <button type="button" onClick={() => onFiltersChange({ stockStatus: 'all' })} className={segBtnClass(filters.stockStatus === 'all')}>
            Tümü
          </button>
          <button type="button" onClick={() => onFiltersChange({ stockStatus: 'in' })} className={segBtnClass(filters.stockStatus === 'in')}>
            Stokta
          </button>
          <button type="button" onClick={() => onFiltersChange({ stockStatus: 'supply' })} className={segBtnClass(filters.stockStatus === 'supply')}>
            Tedarik
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {showDiscountRow && (
            <button
              type="button"
              onClick={() => onFiltersChange({ onlyDiscount: !filters.onlyDiscount })}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[12.5px] text-[#14223b] transition-colors hover:bg-[#f6f8fc]"
            >
              <span className={checkBox(filters.onlyDiscount, 'emerald')}>
                {filters.onlyDiscount && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">Sadece indirimli</span>
              <Percent className="h-3.5 w-3.5 flex-none text-[#047857]" />
            </button>
          )}
          {showAgreementRow && (
            <button
              type="button"
              onClick={() => onFiltersChange({ onlyAgreement: !filters.onlyAgreement })}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[12.5px] text-[#14223b] transition-colors hover:bg-[#f6f8fc]"
            >
              <span className={checkBox(filters.onlyAgreement, 'navy')}>
                {filters.onlyAgreement && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">Sadece anlaşmalı</span>
              <ArrowLeftRight className="h-3.5 w-3.5 flex-none text-[#1c4585]" />
            </button>
          )}
        </div>
      </div>

      {/* Fiyat araligi karti */}
      <div className="rounded-xl border border-[var(--line)] bg-white p-3.5 shadow-[0_1px_2px_rgba(20,34,59,.04)]">
        <div className="mb-2.5 text-[13px] font-semibold text-[#14223b]">
          Fiyat aralığı <span className="text-[11px] font-normal text-[#9aa6b8]">(₺)</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.minPrice ?? ''}
            onChange={(e) => onFiltersChange({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
            className="h-9 min-w-0 flex-1 rounded-lg border border-[#e3e8f0] bg-white px-2.5 text-[13px] text-[#14223b] outline-none focus:border-[#c3d0e6]"
          />
          <span className="text-[#c2cbda]">–</span>
          <input
            type="number"
            placeholder="Max"
            value={filters.maxPrice ?? ''}
            onChange={(e) => onFiltersChange({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
            className="h-9 min-w-0 flex-1 rounded-lg border border-[#e3e8f0] bg-white px-2.5 text-[13px] text-[#14223b] outline-none focus:border-[#c3d0e6]"
          />
        </div>
      </div>

      {/* SIDE banner — admin SIDE banner varsa ondan, yoksa statik promo. aspect-[4/5] */}
      <Link href={bannerLink} className="relative block aspect-[4/5] overflow-hidden rounded-xl border border-[var(--line)]">
        {sideBanner?.imageUrl ? (
          <>
            <img src={sideBanner.imageUrl} alt={sideBanner.title} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4 text-white">
              <div className="text-[17px] font-semibold leading-tight">{sideBanner.title}</div>
              {sideBanner.subtitle && <div className="text-[12px] text-white/85">{sideBanner.subtitle}</div>}
              <span className="mt-1 inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold">
                {sideBanner.buttonText || 'Keşfet'} <ArrowRight className="h-[15px] w-[15px]" />
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a7a55] to-[#0c8f63]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 text-white">
              <Percent className="h-[26px] w-[26px] text-white/80" />
              <div className="mt-1 text-[17px] font-semibold leading-tight">İndirimli fırsatlar</div>
              <div className="text-[12px] text-white/85">Net fiyat avantajlı ürünler</div>
              <span className="mt-2 inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold">
                Keşfet <ArrowRight className="h-[15px] w-[15px]" />
              </span>
            </div>
          </>
        )}
      </Link>
    </aside>
  );
}

export default FilterRail;
