'use client';

import { useState, useEffect } from 'react';
import { Product } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (productId: string, quantity: number, priceType: 'INVOICED' | 'WHITE') => Promise<void>;
}

export function ProductDetailModal({ product, isOpen, onClose, onAddToCart }: ProductDetailModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [priceType, setPriceType] = useState<'INVOICED' | 'WHITE'>('INVOICED');
  const [isZoomed, setIsZoomed] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Reset state when product changes
  useEffect(() => {
    setQuantity(1);
    setPriceType('INVOICED');
    setIsZoomed(false);
  }, [product]);

  // Close on ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleAddToCart = async () => {
    if (!product) return;

    setIsAdding(true);
    try {
      await onAddToCart(product.id, quantity, priceType);
      onClose();
    } catch (error) {
      // Error is handled in parent
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen || !product) return null;

  const selectedPrice = priceType === 'INVOICED' ? product.prices.invoiced : product.prices.white;
  const totalPrice = selectedPrice * quantity;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-white hover:bg-gray-100 rounded-full p-2 shadow-lg transition-all hover:scale-110"
        >
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8">
          {/* Left: Image */}
          <div className="space-y-4">
            <div
              className={`relative bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl overflow-hidden ${
                isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
              }`}
              onClick={() => setIsZoomed(!isZoomed)}
            >
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className={`w-full transition-transform duration-300 ${
                    isZoomed ? 'scale-150' : 'scale-100'
                  }`}
                  style={{
                    transformOrigin: 'center center',
                  }}
                />
              ) : (
                <div className="aspect-square flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <svg className="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-medium">Gorsel Yok</p>
                  </div>
                </div>
              )}

              {/* Stock Badge */}
              <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm text-gray-900 px-4 py-2 rounded-lg shadow-lg border border-gray-200">
                <div className="text-xs text-gray-600 font-medium">Fazla Stok</div>
                <div className="text-lg font-bold text-green-600">
                  {product.excessStock} {product.unit}
                </div>
              </div>
            </div>

            {product.imageUrl && (
              <p className="text-xs text-center text-gray-500">
                {isZoomed ? 'Kucultmek icin tiklayin' : 'Buyutmek icin tiklayin'}
              </p>
            )}

            {/* Warehouse Stock Breakdown */}
            {product.warehouseExcessStocks && Object.keys(product.warehouseExcessStocks).length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <h4 className="font-semibold text-sm text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                  </svg>
                  Depo Dagilimi
                </h4>
                <div className="space-y-2">
                  {Object.entries(product.warehouseExcessStocks).map(([warehouse, stock]) => (
                    <div key={warehouse} className="flex justify-between items-center text-sm">
                      <span className="text-gray-700 font-medium">{warehouse}</span>
                      <span className="bg-white px-3 py-1 rounded-lg border border-gray-200 font-semibold text-gray-900">
                        {stock} {product.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div className="space-y-6">
            {/* Product Name */}
            <div>
              <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white px-3 py-1 rounded-lg inline-block text-xs font-semibold mb-3">
                {product.category.name}
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{product.name}</h2>
              <p className="text-sm text-gray-600 font-mono bg-gray-100 px-3 py-2 rounded-lg inline-block">
                Kod: {product.mikroCode}
              </p>
            </div>

            {/* Price Type Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">Fiyat Turu Secin</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`p-4 rounded-xl border-2 transition-all ${
                    priceType === 'INVOICED'
                      ? 'border-primary-600 bg-gradient-to-br from-primary-50 to-primary-100 shadow-lg scale-105'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                  }`}
                  onClick={() => setPriceType('INVOICED')}
                >
                  <div className="text-xs text-gray-600 mb-1">Faturali</div>
                  <div className="text-2xl font-bold text-primary-600">
                    {formatCurrency(product.prices.invoiced)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">/{product.unit}</div>
                </button>
                <button
                  className={`p-4 rounded-xl border-2 transition-all ${
                    priceType === 'WHITE'
                      ? 'border-gray-700 bg-gradient-to-br from-gray-100 to-gray-200 shadow-lg scale-105'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                  }`}
                  onClick={() => setPriceType('WHITE')}
                >
                  <div className="text-xs text-gray-600 mb-1">Beyaz</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(product.prices.white)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">/{product.unit}</div>
                </button>
              </div>
            </div>

            {/* Quantity Selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">Miktar</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl w-12 h-12 flex items-center justify-center font-bold text-xl transition-colors"
                >
                  -
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={quantity}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    if (value === '') {
                      setQuantity(1);
                    } else {
                      const numValue = Math.max(1, Math.min(product.excessStock, parseInt(value)));
                      setQuantity(numValue);
                    }
                  }}
                  className="text-center font-bold text-xl h-12 flex-1 border-2 border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg px-3"
                />
                <button
                  onClick={() => setQuantity(Math.min(product.excessStock, quantity + 1))}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl w-12 h-12 flex items-center justify-center font-bold text-xl transition-colors"
                >
                  +
                </button>
                <span className="text-gray-600 font-medium min-w-[60px]">{product.unit}</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Maksimum: {product.excessStock} {product.unit}
              </p>
            </div>

            {/* Total Price */}
            <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-6 border-2 border-primary-200">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-gray-700 mb-1">Toplam Fiyat</div>
                  <div className="text-3xl font-bold text-primary-700">{formatCurrency(totalPrice)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-600">
                    {quantity} {product.unit} x {formatCurrency(selectedPrice)}
                  </div>
                  <div className="text-xs font-semibold text-primary-600 mt-1">
                    {priceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                  </div>
                </div>
              </div>
            </div>

            {/* Add to Cart Button */}
            <Button
              className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-4 text-lg shadow-xl rounded-xl"
              onClick={handleAddToCart}
              isLoading={isAdding}
            >
              {isAdding ? 'Sepete Ekleniyor...' : 'Sepete Ekle'}
            </Button>

            {/* Info */}
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="text-xs text-blue-800">
                  <p className="font-semibold mb-1">Fazla Stoklu Urun</p>
                  <p>Bu urun fazla stok durumunda oldugu icin ozel fiyatlarla sunulmaktadir.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
