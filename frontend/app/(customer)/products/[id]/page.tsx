'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Product } from '@/types';
import customerApi from '@/lib/api/customer';
import { useCartStore } from '@/lib/store/cartStore';
import { useAuthStore } from '@/lib/store/authStore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProductRecommendations } from '@/components/customer/ProductRecommendations';
import { formatCurrency } from '@/lib/utils/format';
import { getDisplayPrice, getVatLabel } from '@/lib/utils/vatDisplay';
import { getUnitConversionLabel } from '@/lib/utils/unit';
import { getAllowedPriceTypes, getDefaultPriceType } from '@/lib/utils/priceVisibility';
import { getDisplayStock, getMaxOrderQuantity } from '@/lib/utils/stock';
import { confirmBackorder } from '@/lib/utils/confirm';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { addToCart } = useCartStore();
  const { user, loadUserFromStorage } = useAuthStore();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [priceType, setPriceType] = useState<'INVOICED' | 'WHITE'>('INVOICED');
  const [isAdding, setIsAdding] = useState(false);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  const isSubUser = Boolean(user?.parentCustomerId);
  const effectiveVisibility = isSubUser
    ? (user?.priceVisibility === 'WHITE_ONLY' ? 'WHITE_ONLY' : 'INVOICED_ONLY')
    : user?.priceVisibility;
  const vatDisplayPreference = user?.vatDisplayPreference || 'WITHOUT_VAT';
  const allowedPriceTypes = useMemo(
    () => getAllowedPriceTypes(effectiveVisibility),
    [effectiveVisibility]
  );
  const defaultPriceType = getDefaultPriceType(effectiveVisibility);
  const showPriceTypeSelector = allowedPriceTypes.length > 1;

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (params.id) {
      fetchProduct(params.id as string);
    }
  }, [params.id]);

  useEffect(() => {
    if (!product?.id) return;
    trackCustomerActivity({
      type: 'PRODUCT_VIEW',
      productId: product.id,
      productCode: product.mikroCode,
      pagePath: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
      pageTitle: typeof document !== 'undefined' ? document.title : undefined,
      meta: { productName: product.name },
    });
  }, [product?.id]);

  useEffect(() => {
    if (params.id) {
      fetchRecommendations(params.id as string);
    }
  }, [params.id]);

  useEffect(() => {
    if (!allowedPriceTypes.includes(priceType)) {
      setPriceType(defaultPriceType);
    }
  }, [allowedPriceTypes.join('|'), defaultPriceType]);

  const fetchProduct = async (id: string) => {
    setIsLoading(true);
    try {
      const data = await customerApi.getProductById(id);
      setProduct(data);
      setIsZoomed(false);
      setQuantity(1);
    } catch (error) {
      console.error('Urun yukleme hatasi:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRecommendations = async (id: string) => {
    setIsLoadingRecommendations(true);
    try {
      const data = await customerApi.getProductRecommendations(id);
      setRecommendations(data.products || []);
    } catch (error) {
      console.error('Oneriler yuklenemedi:', error);
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;
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

    setIsAdding(true);
    try {
      const safePriceType = allowedPriceTypes.includes(priceType) ? priceType : defaultPriceType;
      await addToCart({
        productId: product.id,
        quantity,
        priceType: safePriceType,
        priceMode,
      });

      toast.success('Urun sepete eklendi!');
      router.push('/cart');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Sepete eklenirken hata olustu');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRecommendationAdd = async (productId: string) => {
    try {
      const safePriceType = allowedPriceTypes.includes(defaultPriceType)
        ? defaultPriceType
        : (allowedPriceTypes[0] || 'INVOICED');
      await addToCart({
        productId,
        quantity: 1,
        priceType: safePriceType,
        priceMode: 'LIST',
      });
      toast.success('Urun sepete eklendi!');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Sepete eklenirken hata olustu');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <p className="text-center text-gray-600">Urun bulunamadi</p>
          <Button onClick={() => router.push('/products')} className="mt-4">
            Urunlere Don
          </Button>
        </Card>
      </div>
    );
  }

  const isDiscounted = product.pricingMode === 'EXCESS';
  const maxQuantity = getMaxOrderQuantity(product, isDiscounted ? 'EXCESS' : 'LIST');
  const displayStock = isDiscounted
    ? product.excessStock ?? 0
    : getDisplayStock(product);
  const priceMode = isDiscounted ? 'EXCESS' : 'LIST';
  const warehouseBreakdown = isDiscounted ? product.warehouseExcessStocks : product.warehouseStocks;
  const warehouseLabels: Record<string, string> = { '1': 'Merkez Depo', '6': 'Topca Depo' };
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
  const priceGridClass = allowedPriceTypes.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
  const calcDiscount = (listPrice?: number, salePrice?: number) => {
    if (!listPrice || listPrice <= 0 || !salePrice || salePrice >= listPrice) return null;
    return Math.round(((listPrice - salePrice) / listPrice) * 100);
  };
  const invoicedDiscount = calcDiscount(listInvoiced, product.prices.invoiced);
  const whiteDiscount = calcDiscount(listWhite, product.prices.white);
  const excessInvoicedDiscount = calcDiscount(product.prices.invoiced, excessInvoiced);
  const excessWhiteDiscount = calcDiscount(product.prices.white, excessWhite);
  const shouldShowDiscounts = !hasAgreement;
  const selectedPriceType = allowedPriceTypes.includes(priceType) ? priceType : defaultPriceType;
  const selectedPrice = selectedPriceType === 'INVOICED' ? product.prices.invoiced : product.prices.white;
  const totalPrice = selectedPrice * quantity;
  const displaySelectedPrice = getDisplayPrice(
    selectedPrice,
    product.vatRate,
    selectedPriceType,
    vatDisplayPreference
  );
  const displayTotalPrice = getDisplayPrice(
    totalPrice,
    product.vatRate,
    selectedPriceType,
    vatDisplayPreference
  );
  const displayInvoicedPrice = getDisplayPrice(
    product.prices.invoiced,
    product.vatRate,
    'INVOICED',
    vatDisplayPreference
  );
  const displayWhitePrice = getDisplayPrice(
    product.prices.white,
    product.vatRate,
    'WHITE',
    vatDisplayPreference
  );
  const displayListInvoiced = listInvoiced
    ? getDisplayPrice(listInvoiced, product.vatRate, 'INVOICED', vatDisplayPreference)
    : 0;
  const displayListWhite = listWhite
    ? getDisplayPrice(listWhite, product.vatRate, 'WHITE', vatDisplayPreference)
    : 0;
  const displayExcessInvoiced = excessInvoiced !== undefined
    ? getDisplayPrice(excessInvoiced, product.vatRate, 'INVOICED', vatDisplayPreference)
    : undefined;
  const displayExcessWhite = excessWhite !== undefined
    ? getDisplayPrice(excessWhite, product.vatRate, 'WHITE', vatDisplayPreference)
    : undefined;
  const unitLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);
  const vatPercent = Math.round((Number(product.vatRate) || 0) * 100);
  const formatAgreementDate = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toISOString().slice(0, 10);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="container-custom py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Button variant="ghost" onClick={() => router.push('/products')}>
            <- Urunlere Don
          </Button>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="rounded-full border border-gray-200 bg-white px-3 py-1 font-semibold text-gray-700">
              {product.category.name}
            </span>
            <span className="font-mono bg-white border border-gray-200 px-2 py-1 rounded">
              Kod: {product.mikroCode}
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-6">
          <div className="space-y-6">
            <Card className="border-2 border-primary-100 shadow-xl overflow-hidden">
              <div className="grid md:grid-cols-2 gap-8 p-6">
                <div className="space-y-4">
                  <div
                    className={`relative bg-white border border-gray-200 rounded-2xl overflow-hidden aspect-square ${
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
                        style={{ transformOrigin: 'center center' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}

                    <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm text-gray-900 px-4 py-2 rounded-lg shadow-lg border border-gray-200">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500">
                        {isDiscounted ? 'Fazla Stok' : 'Stok'}
                      </div>
                      <div className="text-lg font-bold text-green-600">
                        {displayStock} {product.unit}
                      </div>
                    </div>

                    {isDiscounted && (
                      <div className="absolute top-4 right-4 bg-green-600 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow">
                        Fazla Stok
                      </div>
                    )}
                  </div>

                  {warehouseEntries.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <h4 className="font-semibold text-sm text-gray-900 mb-3">
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

                <div className="space-y-5">
                  <div>
                    <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white px-3 py-1 rounded-lg inline-block text-xs font-semibold mb-3">
                      {product.category.name}
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">{product.name}</h1>
                    <div className="text-sm text-gray-600 font-mono bg-gray-100 px-3 py-2 rounded-lg inline-block">
                      Kod: {product.mikroCode}
                    </div>
                    {unitLabel && (
                      <p className="mt-2 text-xs text-gray-500">{unitLabel}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-gray-50 p-3 border border-gray-200">
                      <div className="text-xs text-gray-500">KDV Orani</div>
                      <div className="text-lg font-semibold text-gray-900">%{vatPercent}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3 border border-gray-200">
                      <div className="text-xs text-gray-500">Birim</div>
                      <div className="text-lg font-semibold text-gray-900">{product.unit}</div>
                    </div>
                  </div>

                  {product.agreement && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                      <div className="font-semibold">Anlasmali fiyat</div>
                      <div>Min miktar: {agreementMinQuantity} {product.unit}</div>
                      {product.agreement.customerProductCode && (
                        <div>Ozel urun kodu: {product.agreement.customerProductCode}</div>
                      )}
                      <div>
                        Gecerlilik: {formatAgreementDate(product.agreement.validFrom)}
                        {product.agreement.validTo ? ` - ${formatAgreementDate(product.agreement.validTo)}` : ''}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      {showPriceTypeSelector ? 'Fiyat Turu Secin' : 'Fiyat'}
                    </label>
                    <div className={`grid ${priceGridClass} gap-3`}>
                      {allowedPriceTypes.includes('INVOICED') && (
                        <button
                          className={`p-4 rounded-xl border-2 transition-all ${
                            selectedPriceType === 'INVOICED'
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

                      {allowedPriceTypes.includes('WHITE') && (
                        <button
                          className={`p-4 rounded-xl border-2 transition-all ${
                            selectedPriceType === 'WHITE'
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
                          <div className="text-xs text-gray-500 mt-1">
                            /{product.unit} <span className="text-gray-700 font-semibold">{getVatLabel('WHITE', vatDisplayPreference)}</span>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6 lg:sticky lg:top-6">
            <Card className="border-2 border-green-200 shadow-xl">
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Siparis Ozeti</h3>
                  <p className="text-xs text-gray-500">Secilen fiyata gore hesaplanir.</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Miktar ({product.unit})
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl w-11 h-11 flex items-center justify-center font-bold text-xl transition-colors"
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
                          return;
                        }
                        const numericValue = parseInt(value);
                        const nextValue = Math.max(1, numericValue);
                        setQuantity(nextValue);
                      }}
                      onBlur={(e) => {
                        if (e.target.value === '' || parseInt(e.target.value) === 0) {
                          setQuantity(1);
                        }
                      }}
                      className="text-center font-bold text-lg h-11 w-24 border-2 border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg px-3"
                    />
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl w-11 h-11 flex items-center justify-center font-bold text-xl transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Mevcut stok: {maxQuantity} {product.unit}
                  </p>
                </div>

                <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-5 border-2 border-primary-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Toplam Tutar</div>
                      <div className="text-2xl font-bold text-primary-700">{formatCurrency(displayTotalPrice)}</div>
                    </div>
                    <div className="text-right text-xs text-gray-600">
                      <div>{quantity} {product.unit} x {formatCurrency(displaySelectedPrice)}</div>
                      <div className="mt-1 font-semibold text-primary-600">
                        {selectedPriceType === 'INVOICED' ? 'Faturali' : 'Beyaz'}
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-3 text-lg shadow-xl rounded-xl"
                  onClick={handleAddToCart}
                  isLoading={isAdding}
                >
                  {isAdding ? 'Sepete Ekleniyor...' : 'Sepete Ekle'}
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  Urun sepete eklenecek, sonra siparis olusturabilirsiniz.
                </p>
              </div>
            </Card>

            {isDiscounted && (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="text-xs text-blue-800">
                    <p className="font-semibold mb-1">Fazla Stoklu Urun</p>
                    <p>Bu urun fazla stok durumunda oldugu icin ozel fiyatlarla sunulur.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {isLoadingRecommendations ? (
          <div className="mt-6 text-sm text-gray-500">Oneriler yukleniyor...</div>
        ) : recommendations.length > 0 ? (
          <div className="mt-8">
            <ProductRecommendations
              products={recommendations}
              title="Tamamlayici Urunler"
              icon="+"
              onProductClick={(item) => router.push(`/products/${item.id}`)}
              onAddToCart={handleRecommendationAdd}
              allowedPriceTypes={allowedPriceTypes}
              vatDisplayPreference={vatDisplayPreference}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
