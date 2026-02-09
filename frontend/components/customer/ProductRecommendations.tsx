'use client';

import { Product } from '@/types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { formatCurrency } from '@/lib/utils/format';
import { getDisplayPrice, getVatLabel } from '@/lib/utils/vatDisplay';

interface ProductRecommendationsProps {
  products: Product[];
  title: string;
  icon?: string;
  onProductClick: (product: Product) => void;
  onAddToCart?: (productId: string) => void;
  allowedPriceTypes?: Array<'INVOICED' | 'WHITE'>;
  vatDisplayPreference?: 'WITH_VAT' | 'WITHOUT_VAT';
}

export function ProductRecommendations({
  products,
  title,
  icon = '?',
  onProductClick,
  onAddToCart,
  allowedPriceTypes,
  vatDisplayPreference,
}: ProductRecommendationsProps) {
  if (products.length === 0) return null;

  const resolvedPriceTypes = allowedPriceTypes && allowedPriceTypes.length > 0
    ? allowedPriceTypes
    : ['INVOICED', 'WHITE'];

  return (
    <div className="mb-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        {title}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {products.map((product) => {
          const vatRate = typeof product.vatRate === 'number' ? product.vatRate : 0;
          const displayInvoiced = getDisplayPrice(
            product.prices.invoiced,
            vatRate,
            'INVOICED',
            vatDisplayPreference
          );
          const displayWhite = getDisplayPrice(
            product.prices.white,
            vatRate,
            'WHITE',
            vatDisplayPreference
          );
          const invoicedLabel = getVatLabel('INVOICED', vatDisplayPreference);
          const whiteLabel = getVatLabel('WHITE', vatDisplayPreference);

          return (
            <Card
              key={product.id}
              className="group hover:shadow-xl hover:scale-105 transition-all duration-300 p-0 cursor-pointer border-2 border-gray-200 hover:border-primary-400"
              onClick={() => onProductClick(product)}
            >
              <div className="space-y-2">
                {/* Product Image */}
                <div className="w-full aspect-square bg-white overflow-hidden relative">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  {/* Stock badge */}
                  <div className="absolute top-1 right-1 bg-green-600 text-white text-xs font-bold px-1.5 py-0.5 rounded shadow">
                    {product.excessStock}
                  </div>
                </div>

                {/* Product Info */}
                <div className="px-2 pb-2">
                  <h4 className="font-semibold text-gray-900 text-xs line-clamp-2 leading-tight mb-1 min-h-[32px]">
                    {product.name}
                  </h4>
                  <div className="space-y-1">
                    {resolvedPriceTypes.includes('INVOICED') && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">Faturali:</span>
                        <span className="font-bold text-primary-700">
                          {formatCurrency(displayInvoiced)}
                        </span>
                      </div>
                    )}
                    {resolvedPriceTypes.includes('WHITE') && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">Beyaz:</span>
                        <span className="font-bold text-gray-700">
                          {formatCurrency(displayWhite)}
                        </span>
                      </div>
                    )}
                    {resolvedPriceTypes.length === 1 && resolvedPriceTypes[0] === 'INVOICED' && (
                      <div className="text-[10px] text-gray-500">{invoicedLabel}</div>
                    )}
                    {resolvedPriceTypes.length === 1 && resolvedPriceTypes[0] === 'WHITE' && (
                      <div className="text-[10px] text-gray-500">{whiteLabel}</div>
                    )}
                  </div>
                  {onAddToCart && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToCart(product.id);
                      }}
                      className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white text-xs py-1.5"
                    >
                      Ekle
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
