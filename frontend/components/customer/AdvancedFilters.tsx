'use client';

import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface AdvancedFiltersProps {
  onFilterChange: (filters: FilterState) => void;
  onReset: () => void;
  allowedPriceTypes?: Array<'invoiced' | 'white'>;
}

export interface FilterState {
  minPrice?: number;
  maxPrice?: number;
  minStock?: number;
  maxStock?: number;
  sortBy: 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'stock-asc' | 'stock-desc' | 'none';
  priceType: 'invoiced' | 'white';
}

export function AdvancedFilters({ onFilterChange, onReset, allowedPriceTypes }: AdvancedFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const allowedTypes = (allowedPriceTypes && allowedPriceTypes.length > 0
    ? allowedPriceTypes
    : ['invoiced', 'white']) as Array<'invoiced' | 'white'>;

  const defaultPriceType: FilterState['priceType'] = allowedTypes.includes('invoiced') ? 'invoiced' : 'white';
  const showPriceTypeSelector = allowedTypes.length > 1;

  const [filters, setFilters] = useState<FilterState>({
    sortBy: 'none',
    priceType: defaultPriceType,
  });

  useEffect(() => {
    if (!allowedTypes.includes(filters.priceType)) {
      const nextFilters = { ...filters, priceType: defaultPriceType };
      setFilters(nextFilters);
      onFilterChange(nextFilters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedTypes.join('|')]);

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    onFilterChange(nextFilters);
  };

  const handleReset = () => {
    const resetFilters: FilterState = {
      sortBy: 'none',
      priceType: defaultPriceType,
    };
    setFilters(resetFilters);
    onReset();
    onFilterChange(resetFilters);
  };

  const hasActiveFilters =
    typeof filters.minPrice === 'number' ||
    typeof filters.maxPrice === 'number' ||
    typeof filters.minStock === 'number' ||
    typeof filters.maxStock === 'number' ||
    filters.sortBy !== 'none';

  const priceTypeLabel = filters.priceType === 'invoiced' ? 'Faturali' : 'Beyaz';

  return (
    <div className="rounded-xl border border-primary-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Gelismis Filtreler</h3>
          <p className="text-xs text-gray-500">Sonuclari fiyat, stok ve siralamaya gore daraltin.</p>
        </div>
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50"
        >
          {isExpanded ? 'Filtreleri Gizle' : 'Filtreleri Goster'}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">Siralama</label>
            <select
              value={filters.sortBy}
              onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              className="input h-11 w-full border-2 border-gray-200"
            >
              <option value="none">Varsayilan</option>
              <option value="name-asc">Isim (A-Z)</option>
              <option value="name-desc">Isim (Z-A)</option>
              <option value="price-asc">Fiyat (Dusukten Yuksege)</option>
              <option value="price-desc">Fiyat (Yuksekten Dusuge)</option>
              <option value="stock-asc">Stok (Azdan Coga)</option>
              <option value="stock-desc">Stok (Cogdan Aza)</option>
            </select>
          </div>

          {showPriceTypeSelector && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">Fiyat Turu</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleFilterChange('priceType', 'invoiced')}
                  className={`rounded-lg py-2 text-sm font-semibold ${
                    filters.priceType === 'invoiced'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Faturali
                </button>
                <button
                  onClick={() => handleFilterChange('priceType', 'white')}
                  className={`rounded-lg py-2 text-sm font-semibold ${
                    filters.priceType === 'white' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Beyaz
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">Fiyat Araligi ({priceTypeLabel})</label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Min fiyat"
                value={filters.minPrice ?? ''}
                onChange={(e) => handleFilterChange('minPrice', e.target.value ? Number(e.target.value) : undefined)}
                className="h-11 border-2 border-gray-200"
              />
              <Input
                type="number"
                placeholder="Max fiyat"
                value={filters.maxPrice ?? ''}
                onChange={(e) => handleFilterChange('maxPrice', e.target.value ? Number(e.target.value) : undefined)}
                className="h-11 border-2 border-gray-200"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">Stok Araligi</label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Min stok"
                value={filters.minStock ?? ''}
                onChange={(e) => handleFilterChange('minStock', e.target.value ? Number(e.target.value) : undefined)}
                className="h-11 border-2 border-gray-200"
              />
              <Input
                type="number"
                placeholder="Max stok"
                value={filters.maxStock ?? ''}
                onChange={(e) => handleFilterChange('maxStock', e.target.value ? Number(e.target.value) : undefined)}
                className="h-11 border-2 border-gray-200"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <div className="rounded-lg border border-primary-100 bg-primary-50 p-3 text-xs text-primary-900">
              <div className="mb-1 font-semibold">Aktif filtreler</div>
              <div className="flex flex-wrap gap-2">
                {typeof filters.minPrice === 'number' && <span>Min fiyat: {filters.minPrice}</span>}
                {typeof filters.maxPrice === 'number' && <span>Max fiyat: {filters.maxPrice}</span>}
                {typeof filters.minStock === 'number' && <span>Min stok: {filters.minStock}</span>}
                {typeof filters.maxStock === 'number' && <span>Max stok: {filters.maxStock}</span>}
                {filters.sortBy !== 'none' && <span>Siralama: {getSortLabel(filters.sortBy)}</span>}
              </div>
            </div>
          )}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              onClick={handleReset}
              className="w-full border border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
            >
              Gelismis Filtreleri Temizle
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function getSortLabel(sortBy: FilterState['sortBy']): string {
  const labels: Record<FilterState['sortBy'], string> = {
    'name-asc': 'Isim (A-Z)',
    'name-desc': 'Isim (Z-A)',
    'price-asc': 'Fiyat (Dusukten Yuksege)',
    'price-desc': 'Fiyat (Yuksekten Dusuge)',
    'stock-asc': 'Stok (Azdan Coga)',
    'stock-desc': 'Stok (Cogdan Aza)',
    none: 'Varsayilan',
  };

  return labels[sortBy];
}
