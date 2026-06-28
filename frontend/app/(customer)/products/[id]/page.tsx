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
import { ArrowLeft, ImageIcon, ImageOff, CheckCircle2, Minus, Plus, Handshake, Truck, Package } from 'lucide-react';

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
  const [isReportingImageIssue, setIsReportingImageIssue] = useState(false);
  const [imageIssueReported, setImageIssueReported] = useState(false);

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
      setImageIssueReported(false);
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
        <div className="card card-pad text-center">
          <p className="text-gray-600">Ürün bulunamadı</p>
          <button onClick={() => router.push('/products')} className="btn-primary mt-4">
            Ürünlere Dön
          </button>
        </div>
      </div>
    );
  }

  const isDiscounted = product.pricingMode === 'EXCESS';
  const maxQuantity = isDiscounted
    ? Math.max(getDisplayStock(product), Number(product.excessStock) || 0)
    : getMaxOrderQuantity(product, 'LIST');
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
  const selectedListPrice = selectedPriceType === 'INVOICED' ? listInvoiced : listWhite;
  const selectedDiscount = selectedPriceType === 'INVOICED' ? invoicedDiscount : whiteDiscount;
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
  const displaySelectedListPrice = selectedListPrice
    ? getDisplayPrice(selectedListPrice, product.vatRate, selectedPriceType, vatDisplayPreference)
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

  const rawDescription = (product as { description?: string | null }).description;
  const descriptionText = typeof rawDescription === 'string' ? rawDescription.trim() : '';
  const packagingInfo = unitLabel || 'Koli ici bilgisi bulunamadi';

  const stockInStock = Number(displayStock) > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <button onClick={() => router.push('/products')} className="btn-ghost">
            <ArrowLeft className="w-4 h-4" />
            Ürünlere Dön
          </button>
          <div className="flex items-center gap-2">
            <span className="chip">{product.category.name}</span>
            <span className="chip font-mono">{product.mikroCode}</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-6">
          <div className="space-y-5">
            <div className="card overflow-hidden">
              <div className="grid md:grid-cols-2 gap-6 p-5">
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
                        className={`w-full h-full object-contain p-2 transition-transform duration-300 ${
                          isZoomed ? 'scale-150' : 'scale-100'
                        }`}
                        style={{ transformOrigin: 'center center' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <ImageIcon className="w-16 h-16" strokeWidth={1.5} />
                      </div>
                    )}

                    {/* Stok rozeti: stok>0 ise emerald, yoksa amber tedarik tonu */}
                    {stockInStock ? (
                      <span className="absolute top-3 left-3 bg-white/95 backdrop-blur text-emerald-700 ring-1 ring-emerald-200 text-xs font-semibold px-2.5 py-1 rounded-md leading-tight shadow-sm">
                        Stok {displayStock} {product.unit}
                      </span>
                    ) : (
                      <span className="absolute top-3 left-3 bg-white/95 backdrop-blur text-amber-700 ring-1 ring-amber-200 text-xs font-semibold px-2.5 py-1 rounded-md leading-tight shadow-sm">
                        Tedarikle
                      </span>
                    )}

                    {isDiscounted && (
                      <span className="absolute top-3 right-3 badge-success shadow-sm">
                        İndirimli
                      </span>
                    )}
                  </div>

                  {warehouseEntries.length > 0 && (
                    <div className="surface p-4">
                      <h4 className="font-semibold text-sm text-gray-900 mb-3">
                        Depo Dağılımı
                      </h4>
                      <div className="space-y-2">
                        {warehouseEntries.map(({ key, stock }) => (
                          <div key={key} className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">{warehouseLabels[key] || key}</span>
                            <span className="bg-white px-2.5 py-1 rounded-md border border-gray-200 font-semibold text-gray-900">
                              {stock} {product.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleReportImageIssue}
                    disabled={imageIssueReported || isReportingImageIssue}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                      imageIssueReported
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {imageIssueReported ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <ImageOff className="w-4 h-4" />
                    )}
                    {isReportingImageIssue
                      ? 'Bildiriliyor...'
                      : imageIssueReported
                      ? 'Resim hatası bildirildi'
                      : 'Resim hatası bildir'}
                  </button>
                </div>

                <div className="space-y-5">
                  <div>
                    <span className="badge-info mb-2">{product.category.name}</span>
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">{product.name}</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                      <span className="font-mono">{product.mikroCode}</span>
                      {unitLabel && <span>{unitLabel}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="surface p-3">
                      <div className="text-xs text-gray-400">KDV Oranı</div>
                      <div className="text-lg font-semibold text-gray-900">%{vatPercent}</div>
                    </div>
                    <div className="surface p-3">
                      <div className="text-xs text-gray-400">Birim</div>
                      <div className="text-lg font-semibold text-gray-900">{product.unit}</div>
                    </div>
                  </div>

                  {product.agreement && (
                    <div className="rounded-lg border border-primary-100 bg-primary-50 p-3.5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-primary-800">
                        <Handshake className="w-4 h-4" />
                        Anlaşmalı Fiyat
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-primary-800/90">
                        <div className="flex justify-between gap-3">
                          <span className="text-primary-700/70">Min. miktar</span>
                          <span className="font-medium">{agreementMinQuantity} {product.unit}</span>
                        </div>
                        {product.agreement.customerProductCode && (
                          <div className="flex justify-between gap-3">
                            <span className="text-primary-700/70">Müşteri ürün kodu</span>
                            <span className="font-mono font-medium">{product.agreement.customerProductCode}</span>
                          </div>
                        )}
                        <div className="flex justify-between gap-3">
                          <span className="text-primary-700/70">Geçerlilik</span>
                          <span className="font-medium">
                            {formatAgreementDate(product.agreement.validFrom)}
                            {product.agreement.validTo ? ` – ${formatAgreementDate(product.agreement.validTo)}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="field-label">
                      {showPriceTypeSelector ? 'Fiyat Türü Seçin' : 'Fiyat'}
                    </label>
                    <div className={`grid ${priceGridClass} gap-3`}>
                      {allowedPriceTypes.includes('INVOICED') && (
                        <button
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            selectedPriceType === 'INVOICED'
                              ? 'border-primary-500 bg-primary-50 shadow-sm'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                          onClick={() => showPriceTypeSelector && setPriceType('INVOICED')}
                          disabled={!showPriceTypeSelector}
                        >
                          <div className="text-xs text-gray-500 mb-1">Faturalı</div>
                          <div className="text-2xl font-bold text-primary-600">
                            {formatCurrency(displayInvoicedPrice)}
                          </div>
                          {shouldShowDiscounts && isDiscounted && listInvoiced && listInvoiced > 0 && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-emerald-700">
                              <span className="text-xs line-through text-emerald-600/50">{formatCurrency(displayListInvoiced)}</span>
                              {invoicedDiscount && <span className="badge-success">%{invoicedDiscount} avantaj</span>}
                            </div>
                          )}
                          {shouldShowDiscounts && !isDiscounted && product.excessStock > 0 && displayExcessInvoiced !== undefined && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-emerald-700">
                              <span className="text-xs font-semibold">İndirimli: {formatCurrency(displayExcessInvoiced)}</span>
                              {excessInvoicedDiscount && <span className="badge-success">%{excessInvoicedDiscount}</span>}
                            </div>
                          )}
                          <div className="text-[11px] text-gray-400 mt-1.5">
                            /{product.unit} · {getVatLabel('INVOICED', vatDisplayPreference)}
                          </div>
                        </button>
                      )}

                      {allowedPriceTypes.includes('WHITE') && (
                        <button
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            selectedPriceType === 'WHITE'
                              ? 'border-gray-700 bg-gray-50 shadow-sm'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                          onClick={() => showPriceTypeSelector && setPriceType('WHITE')}
                          disabled={!showPriceTypeSelector}
                        >
                          <div className="text-xs text-gray-500 mb-1">Beyaz</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {formatCurrency(displayWhitePrice)}
                          </div>
                          {shouldShowDiscounts && isDiscounted && displayListWhite > 0 && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-emerald-700">
                              <span className="text-xs line-through text-emerald-600/50">{formatCurrency(displayListWhite)}</span>
                              {whiteDiscount && <span className="badge-success">%{whiteDiscount} avantaj</span>}
                            </div>
                          )}
                          {shouldShowDiscounts && !isDiscounted && product.excessStock > 0 && displayExcessWhite !== undefined && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-emerald-700">
                              <span className="text-xs font-semibold">İndirimli: {formatCurrency(displayExcessWhite)}</span>
                              {excessWhiteDiscount && <span className="badge-success">%{excessWhiteDiscount}</span>}
                            </div>
                          )}
                          <div className="text-[11px] text-gray-400 mt-1.5">
                            /{product.unit} · {getVatLabel('WHITE', vatDisplayPreference)}
                          </div>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Indirim vurgusu - secili fiyatta eski -> yeni + avantaj */}
                  {shouldShowDiscounts && isDiscounted && selectedListPrice !== undefined && selectedDiscount && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                      <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                        <span className="line-through text-emerald-600/50">{formatCurrency(displaySelectedListPrice)}</span>
                        <span className="text-emerald-400">→</span>
                        <span className="text-base font-bold">{formatCurrency(displaySelectedPrice)}</span>
                      </span>
                      <span className="badge-success">%{selectedDiscount} avantaj</span>
                    </div>
                  )}

                  {/* Stok yetersiz - tedarik tonu (getirtilebilir ama gecikebilir) */}
                  {!stockInStock && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
                      <Truck className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <span className="text-xs leading-snug text-amber-700">
                        Stokta yok — tedarik edilebilir, teslim gecikebilir; teslim süresi garanti edilemez.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5 lg:sticky lg:top-6">
            <div className="card card-pad space-y-5">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Sipariş Özeti</h3>
                <p className="text-xs text-gray-400 mt-0.5">Seçilen fiyata göre hesaplanır.</p>
              </div>

              <div>
                <label className="field-label">
                  Miktar ({product.unit})
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg w-11 h-11 flex items-center justify-center transition-colors"
                    aria-label="Azalt"
                  >
                    <Minus className="w-4 h-4" />
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
                    className="text-center font-bold text-lg h-11 w-24 border border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 rounded-lg px-3"
                  />
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg w-11 h-11 flex items-center justify-center transition-colors"
                    aria-label="Artır"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Mevcut stok: {maxQuantity} {product.unit}
                </p>
              </div>

              <div className="rounded-xl bg-primary-50 border border-primary-100 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Toplam Tutar</div>
                    <div className="text-2xl font-bold text-primary-700">{formatCurrency(displayTotalPrice)}</div>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <div>{quantity} {product.unit} × {formatCurrency(displaySelectedPrice)}</div>
                    <div className="mt-1 font-medium text-primary-600">
                      {selectedPriceType === 'INVOICED' ? 'Faturalı' : 'Beyaz'}
                    </div>
                  </div>
                </div>
              </div>

              <Button
                className="w-full btn-primary py-3 text-base"
                onClick={handleAddToCart}
                isLoading={isAdding}
              >
                {isAdding ? 'Sepete Ekleniyor...' : 'Sepete Ekle'}
              </Button>

              {descriptionText && (
                <div className="surface p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-1.5">Ürün açıklaması</div>
                  <p className="text-xs text-gray-600 leading-relaxed">{descriptionText}</p>
                </div>
              )}

              {unitLabel && (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-gray-700">
                    <Package className="w-3.5 h-3.5 text-gray-400" />
                    Paketleme
                  </span>
                  <span className="text-gray-500">{packagingInfo}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {isLoadingRecommendations ? (
          <div className="mt-6 text-sm text-gray-400">Öneriler yükleniyor...</div>
        ) : recommendations.length > 0 ? (
          <div className="mt-8">
            <ProductRecommendations
              products={recommendations}
              title="Tamamlayıcı Ürünler"
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
