'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Filter, RotateCcw, X } from 'lucide-react';
import type { CommercialListFilterOptions } from '@/lib/api/admin';

export interface CommercialListFilterValues {
  sectorCode: string;
  createdById: string;
  categoryId: string;
  brandCode: string;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_COMMERCIAL_LIST_FILTERS: CommercialListFilterValues = {
  sectorCode: '',
  createdById: '',
  categoryId: '',
  brandCode: '',
  dateFrom: '',
  dateTo: '',
};

interface Props {
  idPrefix: string;
  values: CommercialListFilterValues;
  options: CommercialListFilterOptions;
  optionsLoading?: boolean;
  onChange: (key: keyof CommercialListFilterValues, value: string) => void;
  onClear: () => void;
}

const selectClass =
  'h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[12.5px] text-[#14223b] outline-none focus:border-[#8aa2ca] focus:ring-2 focus:ring-[#dce6f5]';

export function CommercialListFilters({
  idPrefix,
  values,
  options,
  optionsLoading = false,
  onChange,
  onClear,
}: Props) {
  const activeCount = Object.values(values).filter(Boolean).length;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (activeCount > 0) setOpen(true);
  }, [activeCount]);

  const chips = useMemo(() => {
    const creator = options.creators.find((item) => item.id === values.createdById);
    const category = options.categories.find((item) => item.id === values.categoryId);
    return [
      values.sectorCode
        ? { key: 'sectorCode' as const, label: `Sektör: ${values.sectorCode}` }
        : null,
      values.createdById
        ? { key: 'createdById' as const, label: `Oluşturan: ${creator?.name || values.createdById}` }
        : null,
      values.categoryId
        ? { key: 'categoryId' as const, label: `Kategori: ${category?.name || values.categoryId}` }
        : null,
      values.brandCode
        ? { key: 'brandCode' as const, label: `Marka: ${values.brandCode}` }
        : null,
      values.dateFrom
        ? { key: 'dateFrom' as const, label: `Başlangıç: ${values.dateFrom}` }
        : null,
      values.dateTo
        ? { key: 'dateTo' as const, label: `Bitiş: ${values.dateTo}` }
        : null,
    ].filter(Boolean) as Array<{ key: keyof CommercialListFilterValues; label: string }>;
  }, [options.categories, options.creators, values]);

  return (
    <div className="border-t border-[#eef1f6] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors ${
            open || activeCount > 0
              ? 'border-[#c7d5e9] bg-[#eef2fa] text-[#15356b]'
              : 'border-[#d8e0ec] bg-white text-[#51607a] hover:bg-[#f4f6fa]'
          }`}
          aria-expanded={open}
          aria-controls={`${idPrefix}-advanced-filters`}
        >
          <Filter width={14} height={14} strokeWidth={2} />
          Gelişmiş filtreler
          {activeCount > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#15356b] px-1.5 py-0.5 text-[10px] text-white">
              {activeCount}
            </span>
          )}
        </button>

        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => onChange(chip.key, '')}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#d6e0f1] bg-[#f6f8fc] px-2.5 text-[11px] font-medium text-[#1c4585] hover:bg-[#eef2fa]"
            title={`${chip.label} filtresini kaldır`}
          >
            {chip.label}
            <X width={11} height={11} strokeWidth={2.2} />
          </button>
        ))}

        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium text-[#8b3a3a] hover:bg-[#fef2f2]"
          >
            <RotateCcw width={12} height={12} strokeWidth={2} />
            Tüm filtreleri temizle
          </button>
        )}
      </div>

      {open && (
        <div
          id={`${idPrefix}-advanced-filters`}
          className="mt-3 grid gap-3 rounded-xl border border-[#e7ebf2] bg-[#fafbfd] p-3 sm:grid-cols-2 xl:grid-cols-6"
        >
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[#51607a]">Müşteri sektör kodu</span>
            <select
              value={values.sectorCode}
              onChange={(event) => onChange('sectorCode', event.target.value)}
              className={selectClass}
              disabled={optionsLoading}
            >
              <option value="">Tüm sektörler</option>
              {options.sectors.map((sector) => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[#51607a]">Oluşturan kişi</span>
            <select
              value={values.createdById}
              onChange={(event) => onChange('createdById', event.target.value)}
              className={selectClass}
              disabled={optionsLoading}
            >
              <option value="">Tüm oluşturanlar</option>
              {options.creators.map((creator) => (
                <option key={creator.id} value={creator.id}>
                  {creator.name}{creator.role ? ` · ${creator.role}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[#51607a]">Ürün kategorisi</span>
            <select
              value={values.categoryId}
              onChange={(event) => onChange('categoryId', event.target.value)}
              className={selectClass}
              disabled={optionsLoading}
            >
              <option value="">Tüm kategoriler</option>
              {options.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.mikroCode ? `${category.mikroCode} · ` : ''}{category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[#51607a]">Marka</span>
            <select
              value={values.brandCode}
              onChange={(event) => onChange('brandCode', event.target.value)}
              className={selectClass}
              disabled={optionsLoading}
            >
              <option value="">Tüm markalar</option>
              {options.brands.map((brand) => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#51607a]">
              <CalendarDays width={12} height={12} />
              Başlangıç tarihi
            </span>
            <input
              type="date"
              value={values.dateFrom}
              onChange={(event) => onChange('dateFrom', event.target.value)}
              className={selectClass}
            />
          </label>

          <label className="space-y-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#51607a]">
              <CalendarDays width={12} height={12} />
              Bitiş tarihi
            </span>
            <input
              type="date"
              value={values.dateTo}
              min={values.dateFrom || undefined}
              onChange={(event) => onChange('dateTo', event.target.value)}
              className={selectClass}
            />
          </label>

          <p className="m-0 text-[10.5px] text-[#8b97ac] sm:col-span-2 xl:col-span-6">
            Filtreler tüm kayıt kümesine uygulanır; yalnızca açık sayfadaki sonuçlar filtrelenmez.
            Kategori ve marka, ürün kartındaki güncel sınıflandırmaya göre değerlendirilir.
          </p>
        </div>
      )}
    </div>
  );
}

export default CommercialListFilters;
