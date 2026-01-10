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
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
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

  const hasActiveFilters = filters.minPrice || filters.maxPrice || filters.minStock || filters.maxStock || filters.sortBy !== 'none';
  const priceTypeLabel = filters.priceType === 'invoiced' ? 'Faturali' : 'Beyaz';

  return (
    <div className="bg-white border-2 border-primary-100 rounded-xl shadow-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <span className="text-xl">⚙️</span>
          Gelişmiş Filtreler
        </h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1"
        >
          {isExpanded ? '▲ Gizle' : '▼ Göster'}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-4 animate-fade-in">
          {/* Sorting */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span>🔄</span>
              Sıralama
            </label>
            <select
              value={filters.sortBy}
              onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              className="input w-full h-11 text-sm border-2 border-gray-200 focus:border-primary-500 rounded-lg shadow-sm"
            >
              <option value="none">Varsayılan</option>
              <option value="name-asc">İsim (A-Z)</option>
              <option value="name-desc">İsim (Z-A)</option>
              <option value="price-asc">Fiyat (Düşük → Yüksek)</option>
              <option value="price-desc">Fiyat (Yüksek → Düşük)</option>
              <option value="stock-asc">Stok (Az → Çok)</option>
              <option value="stock-desc">Stok (Çok → Az)</option>
            </select>
          </div>

          {/* Price Type for Sorting */}
          {showPriceTypeSelector && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <span>$</span>
                Fiyat Turu (Siralama icin)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleFilterChange('priceType', 'invoiced')}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                    filters.priceType === 'invoiced'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Faturali
                </button>
                <button
                  onClick={() => handleFilterChange('priceType', 'white')}
                  className={`py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                    filters.priceType === 'white'
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Beyaz
                </button>
              </div>
            </div>
          )}

          {/* Price Range */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span>💵</span>
              Fiyat Araligi ({priceTypeLabel})
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Min fiyat"
                value={filters.minPrice || ''}
                onChange={(e) => handleFilterChange('minPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="h-11 text-sm border-2 border-gray-200 focus:border-primary-500 rounded-lg"
              />
              <Input
                type="number"
                placeholder="Max fiyat"
                value={filters.maxPrice || ''}
                onChange={(e) => handleFilterChange('maxPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="h-11 text-sm border-2 border-gray-200 focus:border-primary-500 rounded-lg"
              />
            </div>
          </div>

          {/* Stock Range */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span>📦</span>
              Stok Aralığı
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Min stok"
                value={filters.minStock || ''}
                onChange={(e) => handleFilterChange('minStock', e.target.value ? parseInt(e.target.value) : undefined)}
                className="h-11 text-sm border-2 border-gray-200 focus:border-primary-500 rounded-lg"
              />
              <Input
                type="number"
                placeholder="Max stok"
                value={filters.maxStock || ''}
                onChange={(e) => handleFilterChange('maxStock', e.target.value ? parseInt(e.target.value) : undefined)}
                className="h-11 text-sm border-2 border-gray-200 focus:border-primary-500 rounded-lg"
              />
            </div>
          </div>

          {/* Reset Button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              onClick={handleReset}
              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-2 border-red-200 font-semibold"
            >
              ✕ Gelişmiş Filtreleri Temizle
            </Button>
          )}

          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="bg-primary-50 border-2 border-primary-200 rounded-lg p-3 text-sm">
              <p className="font-semibold text-primary-900 mb-1">Aktif Filtreler:</p>
              <ul className="space-y-0.5 text-primary-800">
                {filters.minPrice && <li>• Min Fiyat: ₺{filters.minPrice}</li>}
                {filters.maxPrice && <li>• Max Fiyat: ₺{filters.maxPrice}</li>}
                {filters.minStock && <li>• Min Stok: {filters.minStock}</li>}
                {filters.maxStock && <li>• Max Stok: {filters.maxStock}</li>}
                {filters.sortBy !== 'none' && <li>• Sıralama: {getSortLabel(filters.sortBy)}</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getSortLabel(sortBy: string): string {
  const labels: Record<string, string> = {
    'name-asc': 'İsim (A-Z)',
    'name-desc': 'İsim (Z-A)',
    'price-asc': 'Fiyat (Düşük → Yüksek)',
    'price-desc': 'Fiyat (Yüksek → Düşük)',
    'stock-asc': 'Stok (Az → Çok)',
    'stock-desc': 'Stok (Çok → Az)',
  };
  return labels[sortBy] || sortBy;
}
