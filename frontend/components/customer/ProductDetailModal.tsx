'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Product } from '@/types';
import customerApi from '@/lib/api/customer';
import { formatCurrency } from '@/lib/utils/format';
import { getDisplayPrice, getVatLabel } from '@/lib/utils/vatDisplay';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getDisplayStock, getMaxOrderQuantity } from '@/lib/utils/stock';
import { confirmBackorder } from '@/lib/utils/confirm';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import { Button } from '@/components/ui/Button';
import { ProductRecommendations } from '@/components/customer/ProductRecommendations';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (
    productId: string,
    quantity: number,
    priceType: 'INVOICED' | 'WHITE',
    priceMode?: 'LIST' | 'EXCESS'
  ) => Promise<void>;
  allowedPriceTypes?: Array<'INVOICED' | 'WHITE'>;
  vatDisplayPreference?: 'WITH_VAT' | 'WITHOUT_VAT';
}

export function ProductDetailModal({ product, isOpen, onClose, onAddToCart, allowedPriceTypes, vatDisplayPreference }: ProductDetailModalProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const resolvedAllowed: Array<'INVOICED' | 'WHITE'> =
    allowedPriceTypes && allowedPriceTypes.length > 0 ? allowedPriceTypes : ['INVOICED', 'WHITE'];
  const defaultPriceType = resolvedAllowed.includes('INVOICED') ? 'INVOICED' : 'WHITE';
  const [priceType, setPriceType] = useState<'INVOICED' | 'WHITE'>(defaultPriceType);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);

  // Reset state when product changes
  useEffect(() => {
    setQuantity(1);
    setPriceType(defaultPriceType);
    setIsZoomed(false);
    setRecommendations([]);
  }, [product]);

  useEffect(() => {
    if (!resolvedAllowed.includes(priceType)) {
      setPriceType(defaultPriceType);
    }
  }, [resolvedAllowed.join('|')]);

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

  useEffect(() => {
    if (!isOpen || !product?.id) return;
    trackCustomerActivity({
      type: 'PRODUCT_VIEW',
      productId: product.id,
      productCode: product.mikroCode,
      pagePath: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
      pageTitle: typeof document !== 'undefined' ? document.title : undefined,
      meta: { productName: product.name },
    });
  }, [isOpen, product?.id]);

  useEffect(() => {
    if (!isOpen || !product?.id) {
      setRecommendations([]);
      setIsLoadingRecommendations(false);
      return;
    }

    let active = true;

    const loadRecommendations = async () => {
      setIsLoadingRecommendations(true);
      try {
        const data = await customerApi.getProductRecommendations(product.id);
        if (active) {
          setRecommendations(data.products || []);
        }
      } catch (error) {
        console.error('Oneriler yuklenemedi:', error);
        if (active) {
          setRecommendations([]);
        }
      } finally {
        if (active) {
          setIsLoadingRecommendations(false);
        }
      }
    };

    loadRecommendations();

    return () => {
      active = false;
    };
  }, [isOpen, product?.id]);

  const handleAddToCart = async () => {
    if (!product) return;

    setIsAdding(true);
    try {
      if (quantity > maxQuantity) {
        const confirmed = await confirmBackorder({
          requestedQty: quantity,
          availableQty: maxQuantity,
          unit: product.unit,
        });
        if (!confirmed) {
          return;
        }
      }
      const priceMode = product.pricingMode === 'EXCESS' ? 'EXCESS' : 'LIST';
      await onAddToCart(product.id, quantity, priceType, priceMode);
      onClose();
    } catch (error) {
      // Error is handled in parent
    } finally {
      setIsAdding(false);
    }
  };

  const handleRecommendationAdd = async (productId: string) => {
    const recommendation = recommendations.find((item) => item.id === productId);
    if (!recommendation) return;

    const safePriceType = resolvedAllowed.includes(priceType) ? priceType : defaultPriceType;
    const priceMode = recommendation.pricingMode === 'EXCESS' ? 'EXCESS' : 'LIST';

    try {
      await onAddToCart(productId, 1, safePriceType, priceMode);
    } catch (error) {
      // Error is handled in parent
    }
  };

  const handleRecommendationClick = (item: Product) => {
    onClose();
    router.push(`/products/${item.id}`);
  };

  if (!isOpen || !product) return null;

  const isDiscounted = product.pricingMode === 'EXCESS';
  const maxQuantity = getMaxOrderQuantity(product, isDiscounted ? 'EXCESS' : 'LIST');
  const displayStock = isDiscounted
    ? product.excessStock ?? 0
    : getDisplayStock(product);
  const warehouseBreakdown = isDiscounted ? product.warehouseExcessStocks : product.warehouseStocks;
  const warehouseLabels: Record<string, string> = { '1': 'Merkez Depo', '6': 'Topça Depo' };
  const warehouseEntries = Object.entries(warehouseBreakdown || {})
    .map(([warehouse, stock]) => {
      const match = String(warehouse).match(/\d+/);
      const key = match ? match[0] : warehouse;
      return { key, stock: Number(stock) || 0 };
    })
    .filter(({ key, stock }) => (key === '1' || key === '6') && stock > 0);
  const listInvoiced = product.listPrices?.invoiced;
  const listWhite = product.listPrices?.white;
  const excessInvoiced = product.excessPrices?.invoiced;
  const excessWhite = product.excessPrices?.white;
  const hasAgreement = Boolean(product.agreement);
  const agreementMinQuantity = product.agreement?.minQuantity ?? 1;
  const showPriceTypeSelector = resolvedAllowed.length > 1;
  const priceGridClass = resolvedAllowed.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
  const formatAgreementDate = (value?: string | Date | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toISOString().slice(0, 10);
  };

  const calcDiscount = (listPrice?: number, salePrice?: number) => {
    if (!listPrice || listPrice <= 0 || !salePrice || salePrice >= listPrice) return null;
    return Math.round(((listPrice - salePrice) / listPrice) * 100);
  };

  const invoicedDiscount = calcDiscount(listInvoiced, product.prices.invoiced);
  const whiteDiscount = calcDiscount(listWhite, product.prices.white);
  const excessInvoicedDiscount = calcDiscount(product.prices.invoiced, excessInvoiced);
  const excessWhiteDiscount = calcDiscount(product.prices.white, excessWhite);
  const shouldShowDiscounts = !hasAgreement;

  const selectedPrice = priceType === 'INVOICED' ? product.prices.invoiced : product.prices.white;
  const totalPrice = selectedPrice * quantity;
  const displaySelectedPrice = getDisplayPrice(selectedPrice, product.vatRate, priceType, vatDisplayPreference);
  const displayTotalPrice = getDisplayPrice(totalPrice, product.vatRate, priceType, vatDisplayPreference);
  const displayInvoicedPrice = getDisplayPrice(product.prices.invoiced, product.vatRate, 'INVOICED', vatDisplayPreference);
  const displayWhitePrice = getDisplayPrice(product.prices.white, product.vatRate, 'WHITE', vatDisplayPreference);
  const displayListInvoiced = listInvoiced ? getDisplayPrice(listInvoiced, product.vatRate, 'INVOICED', vatDisplayPreference) : 0;
  const displayListWhite = listWhite ? getDisplayPrice(listWhite, product.vatRate, 'WHITE', vatDisplayPreference) : 0;
  const displayExcessInvoiced = excessInvoiced !== undefined
    ? getDisplayPrice(excessInvoiced, product.vatRate, 'INVOICED', vatDisplayPreference)
    : undefined;
  const displayExcessWhite = excessWhite !== undefined
    ? getDisplayPrice(excessWhite, product.vatRate, 'WHITE', vatDisplayPreference)
    : undefined;
  const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);

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
              className={`relative bg-white border border-gray-200 rounded-xl overflow-hidden aspect-square ${
                isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
              }`}
              onClick={() => setIsZoomed(!isZoomed)}
            >
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className={`w-full h-full object-contain transition-transform duration-300 ${
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
                <div className="text-xs text-gray-600 font-medium">
                  {isDiscounted ? 'Fazla Stok' : 'Stok'}
                </div>
                <div className="text-lg font-bold text-green-600">
                  {displayStock} {product.unit}
                </div>
              </div>
            </div>

            {product.imageUrl && (
              <p className="text-xs text-center text-gray-500">
                {isZoomed ? 'Kucultmek icin tiklayin' : 'Buyutmek icin tiklayin'}
              </p>
            )}

            {/* Warehouse Stock Breakdown */}
            {warehouseEntries.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <h4 className="font-semibold text-sm text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                  </svg>
                  {isDiscounted ? 'Depo Dagilimi (Fazla Stok)' : 'Depo Dagilimi'}
                </h4>
                <div className="space-y-2">
                  {warehouseEntries.map(({ key, stock }) => (
                    <div key={key} className="flex justify-between items-center text-sm">
                      <span className="text-gray-700 font-medium">{warehouseLabels[key] || key}</span>
                      <span className="bg-white px-3 py-1 rounded-lg border border-gray-200 font-semibold text-gray-900">
                        {stock} {product.unit}
                      </span>
                    </div>
                  ))}
                </div>
                {isDiscounted && (
                  <p className="text-xs text-gray-500 mt-2">
                    * Sadece fazla stoklu depolar gosterilir
                  </p>
                )}
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
              {unitLabel && (
                <p className="mt-2 text-xs text-gray-500">{unitLabel}</p>
              )}
            </div>

            {/* Price Type Selection */}
            <div className="space-y-3">
              {hasAgreement && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                  <div className="font-semibold">Anlasmali fiyat</div>
                  <div>Min miktar: {agreementMinQuantity} {product.unit}</div>
                  {product.agreement?.customerProductCode && (
                    <div>Ozel urun kodu: {product.agreement.customerProductCode}</div>
                  )}
                  <div>
                    Gecerlilik: {formatAgreementDate(product.agreement?.validFrom)}
                    {product.agreement?.validTo ? ` - ${formatAgreementDate(product.agreement?.validTo)}` : ''}
                  </div>
                </div>
              )}
              <label className="block text-sm font-semibold text-gray-900">
                {showPriceTypeSelector ? 'Fiyat turu secin' : 'Fiyat'}
              </label>
              <div className={`grid ${priceGridClass} gap-3`}>
                {resolvedAllowed.includes('INVOICED') && (
                  <button
                    className={`p-4 rounded-xl border-2 transition-all ${
                      priceType === 'INVOICED'
                        ? 'border-primary-600 bg-gradient-to-br from-primary-50 to-primary-100 shadow-lg scale-105'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                    }`}
                    onClick={() => showPriceTypeSelector && setPriceType('INVOICED')}
                    disabled={!showPriceTypeSelector}
                  >
                    <div className="text-xs text-gray-600 mb-1">Faturali</div>
                    <div className="text-2xl font-bold text-primary-600">
                        {formatCurrency(displayInvoicedPrice)}
                    </div>
                    {shouldShowDiscounts && isDiscounted && listInvoiced && listInvoiced > 0 && (
                      <div className="text-xs text-gray-500">
                        Liste: <span className="line-through">{formatCurrency(displayListInvoiced)}</span>
                      </div>
                    )}
                    {shouldShowDiscounts && isDiscounted && invoicedDiscount && (
                      <div className="text-xs text-green-700 font-semibold">
                        <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded">-%{invoicedDiscount}</span> indirim
                      </div>
                    )}
                      {shouldShowDiscounts && !isDiscounted && product.excessStock > 0 && displayExcessInvoiced !== undefined && (
                        <div className="text-xs text-green-700 font-semibold">
                          Fazla Stok: {formatCurrency(displayExcessInvoiced)}
                          {excessInvoicedDiscount && (
                            <span> (-%{excessInvoicedDiscount})</span>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        /{product.unit} <span className="text-primary-600 font-semibold">{getVatLabel('INVOICED', vatDisplayPreference)}</span>
                      </div>
                  </button>
                )}
                {resolvedAllowed.includes('WHITE') && (
                  <button
                    className={`p-4 rounded-xl border-2 transition-all ${
                      priceType === 'WHITE'
                        ? 'border-gray-700 bg-gradient-to-br from-gray-100 to-gray-200 shadow-lg scale-105'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                    }`}
                    onClick={() => showPriceTypeSelector && setPriceType('WHITE')}
                    disabled={!showPriceTypeSelector}
                  >
                    <div className="text-xs text-gray-600 mb-1">Beyaz</div>
                    <div className="text-2xl font-bold text-gray-900">
                        {formatCurrency(displayWhitePrice)}
                    </div>
                      {shouldShowDiscounts && isDiscounted && displayListWhite > 0 && (
                        <div className="text-xs text-gray-500">
                          Liste: <span className="line-through">{formatCurrency(displayListWhite)}</span>
                        </div>
                      )}
                    {shouldShowDiscounts && isDiscounted && whiteDiscount && (
                      <div className="text-xs text-green-700 font-semibold">
                        <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded">-%{whiteDiscount}</span> indirim
                      </div>
                    )}
                      {shouldShowDiscounts && !isDiscounted && product.excessStock > 0 && displayExcessWhite !== undefined && (
                        <div className="text-xs text-green-700 font-semibold">
                          Fazla Stok: {formatCurrency(displayExcessWhite)}
                          {excessWhiteDiscount && (
                            <span> (-%{excessWhiteDiscount})</span>
                          )}
                        </div>
                      )}
                    <div className="text-xs text-gray-500 mt-1">/{product.unit} <span className="text-gray-700 font-semibold">Ozel Fiyat</span></div>
                  </button>
                )}
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
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    if (value === '' || parseInt(value) === 0) {
                      return; // Allow empty during typing
                    }
                    const numericValue = parseInt(value);
                    const numValue = Math.max(1, numericValue);
                    setQuantity(numValue);
                  }}
                  onBlur={(e) => {
                    // Set to 1 if empty on blur
                    if (e.target.value === '' || parseInt(e.target.value) === 0) {
                      setQuantity(1);
                    }
                  }}
                  className="text-center font-bold text-xl h-12 w-24 border-2 border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg px-3"
                />
                <button
                  onClick={() => {
                    setQuantity(quantity + 1);
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl w-12 h-12 flex items-center justify-center font-bold text-xl transition-colors"
                >
                  +
                </button>
                <span className="text-gray-600 font-semibold">{product.unit}</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Mevcut stok: {maxQuantity} {product.unit}
              </p>
            </div>

            {/* Total Price */}
            <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-6 border-2 border-primary-200">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-gray-700 mb-1">Toplam Fiyat</div>
                  <div className="text-3xl font-bold text-primary-700">{formatCurrency(displayTotalPrice)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-600">
                    {quantity} {product.unit} x {formatCurrency(displaySelectedPrice)}
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
            {isDiscounted && (
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
            )}
          </div>
        </div>

      {(isLoadingRecommendations || recommendations.length > 0) && (
        <div className="px-8 pb-8">
          {isLoadingRecommendations ? (
            <div className="text-sm text-gray-500">Oneriler yukleniyor...</div>
          ) : (
            <ProductRecommendations
              products={recommendations}
              title="Tamamlayici Urunler"
              icon="+"
              onProductClick={handleRecommendationClick}
              onAddToCart={handleRecommendationAdd}
              allowedPriceTypes={resolvedAllowed}
              vatDisplayPreference={vatDisplayPreference}
            />
          )}
        </div>
      )}

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
