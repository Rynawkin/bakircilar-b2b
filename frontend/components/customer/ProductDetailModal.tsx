'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
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
  const [isReportingImageIssue, setIsReportingImageIssue] = useState(false);
  const [imageIssueReported, setImageIssueReported] = useState(false);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);

  // Reset state when product changes
  useEffect(() => {
    setQuantity(1);
    setPriceType(defaultPriceType);
    setIsZoomed(false);
    setImageIssueReported(false);
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

  const handleReportImageIssue = async () => {
    if (!product) return;
    setIsReportingImageIssue(true);
    try {
      const result = await customerApi.reportProductImageIssue(product.id);
      setImageIssueReported(true);
      toast.success(
        result.alreadyReported
          ? 'Bu urun icin acik resim hata talebi zaten var'
          : 'Resim hata talebi gonderildi'
      );
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Resim hata talebi gonderilemedi');
    } finally {
      setIsReportingImageIssue(false);
    }
  };

  if (!isOpen || !product) return null;

  const isDiscounted = product.pricingMode === 'EXCESS';
  const maxQuantity = isDiscounted
    ? Math.max(getDisplayStock(product), Number(product.excessStock) || 0)
    : getMaxOrderQuantity(product, 'LIST');
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
        className="relative bg-white rounded-[22px] shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[var(--ink-2)] shadow-md transition-all hover:bg-[var(--surface-0)] hover:scale-105"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-7 p-6 sm:p-8">
          {/* Left: Image */}
          <div className="space-y-3">
            <div
              className={`relative bg-[var(--surface-1)] border border-[var(--line)] rounded-2xl overflow-hidden aspect-square ${
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
                  <div className="text-center text-[var(--ink-3)]">
                    <svg className="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-medium">Gorsel Yok</p>
                  </div>
                </div>
              )}

              {/* Stock Badge */}
              <div className="absolute top-3.5 right-3.5 rounded-xl border border-[var(--line)] bg-white/95 backdrop-blur-sm px-3 py-1.5 shadow-md">
                <div className="text-[10.5px] font-semibold text-[var(--ink-3)]">
                  {isDiscounted ? 'Fazla Stok' : 'Stok'}
                </div>
                <div className="text-base font-bold text-emerald-700 tabular-nums">
                  {displayStock} {product.unit}
                </div>
              </div>

              {/* Zoom hint pill */}
              {product.imageUrl && (
                <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-[var(--ink-1)]/70 px-3 py-1 text-[11px] font-medium text-white">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="7" strokeWidth={2} />
                    <path strokeLinecap="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
                  </svg>
                  {isZoomed ? 'Kucultmek icin tiklayin' : 'Buyutmek icin tiklayin'}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleReportImageIssue}
              disabled={imageIssueReported || isReportingImageIssue}
              className={`flex h-[38px] w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                imageIssueReported
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" strokeWidth={2} />
                <path strokeLinecap="round" strokeWidth={2} d="M12 8h.01M11 12h1v4h1" />
              </svg>
              {isReportingImageIssue
                ? 'Bildiriliyor...'
                : imageIssueReported
                ? 'Resim hatasi bildirildi'
                : 'Resim hatasi bildir'}
            </button>

            {/* Warehouse Stock Breakdown */}
            {warehouseEntries.length > 0 && (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] p-3.5">
                <h4 className="mb-2.5 flex items-center gap-2 text-[12.5px] font-bold text-[var(--ink-1)]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#eef2fa] text-primary-600">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                    </svg>
                  </span>
                  {isDiscounted ? 'Depo Dagilimi (Fazla Stok)' : 'Depo Dagilimi'}
                </h4>
                <div className="space-y-2">
                  {warehouseEntries.map(({ key, stock }) => (
                    <div key={key} className="flex justify-between items-center text-[13px]">
                      <span className="font-semibold text-[var(--ink-2)]">{warehouseLabels[key] || key}</span>
                      <span className="rounded-lg border border-[var(--line)] bg-white px-3 py-1 font-bold text-[var(--ink-1)] tabular-nums">
                        {stock} {product.unit}
                      </span>
                    </div>
                  ))}
                </div>
                {isDiscounted && (
                  <p className="mt-2 text-[11px] text-[var(--ink-3)]">
                    * Sadece fazla stoklu depolar gosterilir
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div className="space-y-5">
            {/* Product Name */}
            <div>
              <div className="inline-block rounded-lg bg-primary-600 px-2.5 py-1 text-[11px] font-bold text-white">
                {product.category.name}
              </div>
              <h2 className="mt-3 text-[27px] font-bold leading-[1.12] tracking-tight text-[var(--ink-1)]">{product.name}</h2>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-[#f1f4f9] px-2.5 py-1 font-mono text-[12px] text-[var(--ink-2)]">
                  Kod: {product.mikroCode}
                </span>
                {unitLabel && (
                  <span className="text-[12px] text-[var(--ink-3)]">{unitLabel}</span>
                )}
              </div>
            </div>

            {/* Price Type Selection */}
            <div className="space-y-3">
              {hasAgreement && (
                <div className="rounded-xl border border-primary-100 bg-primary-50 p-3.5 text-[12px] text-primary-800">
                  <div className="font-bold text-primary-800">Anlasmali fiyat</div>
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
              <label className="block text-[13px] font-bold text-[var(--ink-1)]">
                {showPriceTypeSelector ? 'Fiyat turu secin' : 'Fiyat'}
              </label>
              <div className={`grid ${priceGridClass} gap-3`}>
                {resolvedAllowed.includes('INVOICED') && (
                  <button
                    className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                      priceType === 'INVOICED'
                        ? 'border-primary-600 bg-[#f6f9ff] shadow-sm'
                        : 'border-[var(--line)] bg-white hover:border-[var(--line-strong)]'
                    }`}
                    onClick={() => showPriceTypeSelector && setPriceType('INVOICED')}
                    disabled={!showPriceTypeSelector}
                  >
                    {priceType === 'INVOICED' && (
                      <span className="absolute right-2.5 top-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary-600 text-white">
                        <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                    <div className="mb-1 text-[11.5px] text-[var(--ink-3)]">Faturali</div>
                    <div className="text-[22px] font-bold tabular-nums text-primary-600">
                        {formatCurrency(displayInvoicedPrice)}
                    </div>
                    {shouldShowDiscounts && isDiscounted && listInvoiced && listInvoiced > 0 && (
                      <div className="text-[11px] text-[var(--ink-3)]">
                        Liste: <span className="line-through">{formatCurrency(displayListInvoiced)}</span>
                      </div>
                    )}
                    {shouldShowDiscounts && isDiscounted && invoicedDiscount && (
                      <div className="text-[11px] font-semibold text-emerald-700">
                        <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5">-%{invoicedDiscount}</span> indirim
                      </div>
                    )}
                      {shouldShowDiscounts && !isDiscounted && product.excessStock > 0 && displayExcessInvoiced !== undefined && (
                        <div className="text-[11px] font-semibold text-emerald-700">
                          Fazla Stok: {formatCurrency(displayExcessInvoiced)}
                          {excessInvoicedDiscount && (
                            <span> (-%{excessInvoicedDiscount})</span>
                          )}
                        </div>
                      )}
                      <div className="mt-1.5 text-[10.5px] text-[var(--ink-3)]">
                        /{product.unit} <span className="font-semibold text-primary-600">{getVatLabel('INVOICED', vatDisplayPreference)}</span>
                      </div>
                  </button>
                )}
                {resolvedAllowed.includes('WHITE') && (
                  <button
                    className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                      priceType === 'WHITE'
                        ? 'border-[var(--ink-1)] bg-[var(--surface-1)] shadow-sm'
                        : 'border-[var(--line)] bg-white hover:border-[var(--line-strong)]'
                    }`}
                    onClick={() => showPriceTypeSelector && setPriceType('WHITE')}
                    disabled={!showPriceTypeSelector}
                  >
                    {priceType === 'WHITE' && (
                      <span className="absolute right-2.5 top-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--ink-1)] text-white">
                        <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                    <div className="mb-1 text-[11.5px] text-[var(--ink-3)]">Beyaz</div>
                    <div className="text-[22px] font-bold tabular-nums text-[var(--ink-1)]">
                        {formatCurrency(displayWhitePrice)}
                    </div>
                      {shouldShowDiscounts && isDiscounted && displayListWhite > 0 && (
                        <div className="text-[11px] text-[var(--ink-3)]">
                          Liste: <span className="line-through">{formatCurrency(displayListWhite)}</span>
                        </div>
                      )}
                    {shouldShowDiscounts && isDiscounted && whiteDiscount && (
                      <div className="text-[11px] font-semibold text-emerald-700">
                        <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5">-%{whiteDiscount}</span> indirim
                      </div>
                    )}
                      {shouldShowDiscounts && !isDiscounted && product.excessStock > 0 && displayExcessWhite !== undefined && (
                        <div className="text-[11px] font-semibold text-emerald-700">
                          Fazla Stok: {formatCurrency(displayExcessWhite)}
                          {excessWhiteDiscount && (
                            <span> (-%{excessWhiteDiscount})</span>
                          )}
                        </div>
                      )}
                    <div className="mt-1.5 text-[10.5px] text-[var(--ink-3)]">/{product.unit} <span className="font-semibold text-[var(--ink-2)]">Ozel Fiyat</span></div>
                  </button>
                )}
              </div>
            </div>

            {/* Quantity Selector */}
            <div>
              <label className="mb-3 block text-[13px] font-bold text-[var(--ink-1)]">Miktar</label>
              <div className="flex items-center gap-3">
                <div className="flex items-center overflow-hidden rounded-xl border border-[var(--line-strong)]">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="flex h-12 w-12 items-center justify-center bg-[var(--surface-1)] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] font-bold text-xl"
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
                    className="h-12 w-16 border-x border-[var(--line)] px-3 text-center text-lg font-bold tabular-nums text-[var(--ink-1)] focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      setQuantity(quantity + 1);
                    }}
                    className="flex h-12 w-12 items-center justify-center bg-[var(--surface-1)] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-0)] font-bold text-xl"
                  >
                    +
                  </button>
                </div>
                <span className="font-semibold text-[var(--ink-2)]">{product.unit}</span>
              </div>
              <p className="mt-2 text-[11px] text-[var(--ink-3)]">
                Mevcut stok: {maxQuantity} {product.unit}
              </p>
            </div>

            {/* Total Price */}
            <div className="flex items-center justify-between rounded-2xl border border-[#d6e0f1] bg-gradient-to-br from-[#eef2fa] to-[#f6f9ff] p-5">
              <div>
                <div className="text-[12.5px] text-[var(--ink-2)]">Toplam Fiyat</div>
                <div className="mt-0.5 text-[30px] font-bold tracking-tight tabular-nums text-primary-600">{formatCurrency(displayTotalPrice)}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] tabular-nums text-[var(--ink-3)]">
                  {quantity} {product.unit} x {formatCurrency(displaySelectedPrice)}
                </div>
                <div className="mt-1 text-[12px] font-bold text-primary-600">
                  {priceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                </div>
              </div>
            </div>

            {/* Add to Cart Button */}
            <Button
              className="flex h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-[15px] font-bold text-white hover:bg-primary-700"
              onClick={handleAddToCart}
              isLoading={isAdding}
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 4h12M17 21a1 1 0 100-2 1 1 0 000 2zM9 21a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
              {isAdding ? 'Sepete Ekleniyor...' : 'Sepete Ekle'}
            </Button>

            {/* Info */}
            {isDiscounted && (
              <div className="flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50 p-4">
                <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="text-[12px] text-primary-800">
                  <p className="mb-1 font-bold">Fazla Stoklu Urun</p>
                  <p>Bu urun fazla stok durumunda oldugu icin ozel fiyatlarla sunulmaktadir.</p>
                </div>
              </div>
            )}
          </div>
        </div>

      {(isLoadingRecommendations || recommendations.length > 0) && (
        <div className="border-t border-[var(--line)] bg-[var(--surface-1)] px-6 py-6 sm:px-8">
          {isLoadingRecommendations ? (
            <div className="text-sm text-[var(--ink-3)]">Oneriler yukleniyor...</div>
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
